import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type Stripe from 'stripe';
import { In, Repository } from 'typeorm';
import { UserRole } from '../common/enums/user-role.enum';
import { type Paginated, paginateRepository } from '../common/pagination/pagination';
import { CoursesService } from '../courses/courses.service';
import { Course } from '../courses/entities/course.entity';
import { CoursePricing, CourseStatus } from '../courses/enums/course.enums';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { SeatPackSource } from '../organizations/enums/organization.enums';
import { OrganizationsService } from '../organizations/organizations.service';
import { type User } from '../users/entities/user.entity';
import { CreateCheckoutDto, ListPurchasesQueryDto } from './dto/payment.dto';
import { Purchase, type PurchaseItem } from './entities/purchase.entity';
import { StripeEvent } from './entities/stripe-event.entity';
import { PurchaseKind, PurchaseStatus } from './enums/payment.enums';
import { paymentsConfig } from './payments.config';
import { StripeClientService } from './stripe-client.service';

export type PurchasePaidHandler = (purchase: Purchase) => Promise<void>;
export type PurchaseRefundedHandler = (purchase: Purchase) => Promise<void>;

export interface WebhookResult {
  received: true;
  eventId: string;
  handled: boolean;
  duplicate: boolean;
}

interface PurchaseDraft {
  kind: PurchaseKind;
  items: PurchaseItem[];
  amountCents: number;
  currency: string;
  organizationId: string | null;
  seats: number | null;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly paidHandlers: PurchasePaidHandler[] = [];

  constructor(
    @InjectRepository(Purchase) private readonly purchases: Repository<Purchase>,
    @InjectRepository(StripeEvent) private readonly events: Repository<StripeEvent>,
    @InjectRepository(Course) private readonly courses: Repository<Course>,
    private readonly stripe: StripeClientService,
    private readonly coursesService: CoursesService,
    private readonly enrollmentsService: EnrollmentsService,
    private readonly organizationsService: OrganizationsService,
    @Inject(paymentsConfig.KEY) private readonly config: ConfigType<typeof paymentsConfig>,
  ) {}

  private readonly refundHandlers: PurchaseRefundedHandler[] = [];

  /** Referrals reverse commissions when a purchase is refunded. */
  registerRefundHandler(handler: PurchaseRefundedHandler): void {
    this.refundHandlers.push(handler);
  }

  /** Referrals hook in here to record commissions once money has changed hands. */
  registerPaidHandler(handler: PurchasePaidHandler): void {
    this.paidHandlers.push(handler);
  }

  async createCheckout(
    user: User,
    dto: CreateCheckoutDto,
  ): Promise<{ purchase: Purchase; checkoutUrl: string }> {
    if (!this.stripe.isConfigured) {
      throw new ServiceUnavailableException('Payments are not configured');
    }
    const draft = await this.buildDraft(user, dto);
    const purchase = await this.purchases.save(
      this.purchases.create({
        userId: user.id,
        kind: draft.kind,
        status: PurchaseStatus.PENDING,
        amountCents: draft.amountCents,
        currency: draft.currency,
        items: draft.items,
        organizationId: draft.organizationId,
        seats: draft.seats,
        referralCode: dto.referralCode?.trim().toUpperCase() ?? null,
      }),
    );

    let session: Stripe.Checkout.Session;
    try {
      session = await this.stripe.createCheckoutSession({
        mode: 'payment',
        client_reference_id: purchase.id,
        customer_email: user.email,
        line_items: this.lineItems(draft),
        success_url: `${this.config.successUrl}?purchaseId=${purchase.id}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${this.config.cancelUrl}?purchaseId=${purchase.id}`,
        metadata: { purchaseId: purchase.id, userId: user.id, kind: purchase.kind },
      });
    } catch (error) {
      purchase.status = PurchaseStatus.CANCELLED;
      await this.purchases.save(purchase);
      this.logger.error(`Stripe checkout failed for purchase ${purchase.id}: ${String(error)}`);
      throw new BadGatewayException('Could not start the checkout');
    }
    purchase.stripeCheckoutSessionId = session.id;
    await this.purchases.save(purchase);
    return { purchase, checkoutUrl: session.url ?? '' };
  }

  /** Called by the client after the Stripe redirect; safe to call repeatedly. */
  async confirm(user: User, purchaseId: string): Promise<Purchase> {
    const purchase = await this.findOwnOrFail(user, purchaseId);
    if (purchase.status !== PurchaseStatus.PENDING) {
      return purchase;
    }
    if (!purchase.stripeCheckoutSessionId) {
      throw new BadRequestException('This purchase has no checkout session');
    }
    const session = await this.stripe.retrieveCheckoutSession(purchase.stripeCheckoutSessionId);
    if (session.payment_status === 'paid') {
      return this.fulfill(purchase, this.paymentIntentId(session));
    }
    return purchase;
  }

  async handleWebhook(
    rawBody: Buffer | string | undefined,
    signature: string | undefined,
  ): Promise<WebhookResult> {
    if (!rawBody || !signature) {
      throw new BadRequestException('Missing webhook payload or signature');
    }
    let event: Stripe.Event;
    try {
      event = this.stripe.constructEvent(rawBody, signature);
    } catch (error) {
      this.logger.warn(`Rejected webhook: ${String(error)}`);
      throw new BadRequestException('Invalid webhook signature');
    }
    if (await this.events.exists({ where: { eventId: event.id } })) {
      return { received: true, eventId: event.id, handled: false, duplicate: true };
    }

    let purchaseId: string | null = null;
    let handled = false;
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object;
        const purchase = await this.findBySession(session);
        if (purchase && session.payment_status === 'paid') {
          await this.fulfill(purchase, this.paymentIntentId(session));
          handled = true;
        }
        purchaseId = purchase?.id ?? null;
        break;
      }
      case 'checkout.session.expired': {
        const purchase = await this.findBySession(event.data.object);
        if (purchase?.status === PurchaseStatus.PENDING) {
          purchase.status = PurchaseStatus.CANCELLED;
          await this.purchases.save(purchase);
          handled = true;
        }
        purchaseId = purchase?.id ?? null;
        break;
      }
      case 'charge.refunded': {
        const charge = event.data.object;
        const intent =
          typeof charge.payment_intent === 'string'
            ? charge.payment_intent
            : charge.payment_intent?.id;
        const purchase = intent
          ? await this.purchases.findOne({ where: { stripePaymentIntentId: intent } })
          : null;
        if (purchase?.status === PurchaseStatus.PAID) {
          await this.markRefunded(purchase, 'Refunded in Stripe');
          handled = true;
        }
        purchaseId = purchase?.id ?? null;
        break;
      }
      default:
        break;
    }
    await this.events.save(this.events.create({ eventId: event.id, type: event.type, purchaseId }));
    return { received: true, eventId: event.id, handled, duplicate: false };
  }

  /** Marks the purchase paid and delivers what was bought. Idempotent. */
  async fulfill(purchase: Purchase, paymentIntentId: string | null): Promise<Purchase> {
    if (purchase.status === PurchaseStatus.PAID) {
      return purchase;
    }
    purchase.status = PurchaseStatus.PAID;
    purchase.paidAt = new Date();
    purchase.stripePaymentIntentId = paymentIntentId ?? purchase.stripePaymentIntentId;
    const saved = await this.purchases.save(purchase);

    if (saved.kind === PurchaseKind.SEAT_PACK && saved.organizationId && saved.seats) {
      await this.organizationsService.grantSeatPack(
        saved.organizationId,
        { seats: saved.seats, note: `Purchase ${saved.id}` },
        SeatPackSource.PURCHASE,
        saved.id,
      );
    } else {
      for (const item of saved.items) {
        await this.enrollmentsService.enrollFromPurchase(saved.userId, item.courseId, saved.id);
      }
    }
    for (const handler of this.paidHandlers) {
      try {
        await handler(saved);
      } catch (error) {
        this.logger.error(`Paid handler failed for purchase ${saved.id}: ${String(error)}`);
      }
    }
    return saved;
  }

  async refund(purchaseId: string, reason: string): Promise<Purchase> {
    const purchase = await this.findByIdOrFail(purchaseId);
    if (purchase.status !== PurchaseStatus.PAID) {
      throw new BadRequestException('Only paid purchases can be refunded');
    }
    if (purchase.stripePaymentIntentId && this.stripe.isConfigured) {
      try {
        await this.stripe.createRefund(purchase.stripePaymentIntentId);
      } catch (error) {
        this.logger.error(`Stripe refund failed for ${purchase.id}: ${String(error)}`);
        throw new BadGatewayException('Stripe rejected the refund');
      }
    }
    return this.markRefunded(purchase, reason);
  }

  async findByIdOrFail(id: string): Promise<Purchase> {
    const purchase = await this.purchases.findOne({ where: { id }, relations: { user: true } });
    if (!purchase) {
      throw new NotFoundException(`Purchase ${id} was not found`);
    }
    return purchase;
  }

  async findOwnOrFail(user: User, id: string): Promise<Purchase> {
    const purchase = await this.findByIdOrFail(id);
    const isStaff = user.role === UserRole.ADMIN || user.role === UserRole.SUPERADMIN;
    if (purchase.userId !== user.id && !isStaff) {
      throw new ForbiddenException('This purchase belongs to someone else');
    }
    return purchase;
  }

  listMine(user: User, query: ListPurchasesQueryDto): Promise<Paginated<Purchase>> {
    return this.list({ ...query, userId: user.id });
  }

  list(query: ListPurchasesQueryDto): Promise<Paginated<Purchase>> {
    return paginateRepository(
      this.purchases,
      {
        where: {
          ...(query.userId ? { userId: query.userId } : {}),
          ...(query.status ? { status: query.status } : {}),
          ...(query.kind ? { kind: query.kind } : {}),
        },
        relations: { user: true },
        order: { createdAt: 'DESC' },
      },
      query,
    );
  }

  private async markRefunded(purchase: Purchase, reason: string): Promise<Purchase> {
    purchase.status = PurchaseStatus.REFUNDED;
    purchase.refundedAt = new Date();
    purchase.refundReason = reason.trim();
    const saved = await this.purchases.save(purchase);
    if (saved.kind === PurchaseKind.SEAT_PACK) {
      await this.organizationsService.removeSeatPacksByPurchase(saved.id);
    } else {
      await this.enrollmentsService.cancelByPurchase(saved.id);
    }
    for (const handler of this.refundHandlers) {
      try {
        await handler(saved);
      } catch (error) {
        this.logger.error(`Refund handler failed for purchase ${saved.id}: ${String(error)}`);
      }
    }
    return saved;
  }

  private async buildDraft(user: User, dto: CreateCheckoutDto): Promise<PurchaseDraft> {
    switch (dto.kind) {
      case PurchaseKind.COURSE: {
        if (!dto.courseId) {
          throw new BadRequestException('courseId is required for a course purchase');
        }
        const [course] = await this.loadPaidCourses(user, [dto.courseId]);
        return {
          kind: dto.kind,
          items: [this.item(course)],
          amountCents: course.priceCents,
          currency: course.currency,
          organizationId: null,
          seats: null,
        };
      }
      case PurchaseKind.BUNDLE: {
        if (!dto.courseIds || dto.courseIds.length < 2) {
          throw new BadRequestException('A bundle needs at least two courses');
        }
        if (dto.courseIds.length > this.config.maxBundleSize) {
          throw new BadRequestException(
            `Bundles are limited to ${this.config.maxBundleSize} courses`,
          );
        }
        const courses = await this.loadPaidCourses(user, dto.courseIds);
        const currencies = new Set(courses.map((course) => course.currency));
        if (currencies.size > 1) {
          throw new BadRequestException('All courses in a bundle must use the same currency');
        }
        return {
          kind: dto.kind,
          items: courses.map((course) => this.item(course)),
          amountCents: courses.reduce((sum, course) => sum + course.priceCents, 0),
          currency: courses[0].currency,
          organizationId: null,
          seats: null,
        };
      }
      case PurchaseKind.SEAT_PACK: {
        if (!dto.organizationId || !dto.seats) {
          throw new BadRequestException('organizationId and seats are required for a seat pack');
        }
        await this.organizationsService.requireManage(user, dto.organizationId);
        return {
          kind: dto.kind,
          items: [],
          amountCents: dto.seats * this.config.seatPriceCents,
          currency: this.config.currency,
          organizationId: dto.organizationId,
          seats: dto.seats,
        };
      }
    }
  }

  private async loadPaidCourses(user: User, courseIds: string[]): Promise<Course[]> {
    const courses = await this.courses.find({ where: { id: In(courseIds) } });
    const byId = new Map(courses.map((course) => [course.id, course]));
    const result: Course[] = [];
    for (const courseId of courseIds) {
      const course = byId.get(courseId);
      if (!course || course.status !== CourseStatus.PUBLISHED) {
        throw new NotFoundException(`Course ${courseId} is not available`);
      }
      if (course.pricing !== CoursePricing.PAID || course.priceCents <= 0) {
        throw new BadRequestException(`"${course.title}" is free, enroll in it directly`);
      }
      if (await this.enrollmentsService.hasAccess(user.id, course.id)) {
        throw new ConflictException(`You already have access to "${course.title}"`);
      }
      result.push(course);
    }
    return result;
  }

  private item(course: Course): PurchaseItem {
    return { courseId: course.id, title: course.title, priceCents: course.priceCents };
  }

  private lineItems(draft: PurchaseDraft): Stripe.Checkout.SessionCreateParams.LineItem[] {
    if (draft.kind === PurchaseKind.SEAT_PACK) {
      return [
        {
          quantity: draft.seats ?? 1,
          price_data: {
            currency: draft.currency.toLowerCase(),
            unit_amount: this.config.seatPriceCents,
            product_data: { name: 'Learner seat' },
          },
        },
      ];
    }
    return draft.items.map((item) => ({
      quantity: 1,
      price_data: {
        currency: draft.currency.toLowerCase(),
        unit_amount: item.priceCents,
        product_data: { name: item.title },
      },
    }));
  }

  private async findBySession(session: Stripe.Checkout.Session): Promise<Purchase | null> {
    const bySession = await this.purchases.findOne({
      where: { stripeCheckoutSessionId: session.id },
    });
    if (bySession) {
      return bySession;
    }
    const reference = session.client_reference_id ?? session.metadata?.purchaseId;
    return reference ? this.purchases.findOne({ where: { id: reference } }) : null;
  }

  private paymentIntentId(session: Stripe.Checkout.Session): string | null {
    if (typeof session.payment_intent === 'string') {
      return session.payment_intent;
    }
    return session.payment_intent?.id ?? null;
  }

  async courseTitles(courseIds: string[]): Promise<Map<string, string>> {
    const courses = await this.coursesService.findManyByIds(courseIds);
    return new Map(courses.map((course) => [course.id, course.title]));
  }
}

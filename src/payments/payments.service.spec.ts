import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserRole } from '../common/enums/user-role.enum';
import { CoursesService } from '../courses/courses.service';
import { Course } from '../courses/entities/course.entity';
import { CoursePricing, CourseStatus } from '../courses/enums/course.enums';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { SeatPackSource } from '../organizations/enums/organization.enums';
import { OrganizationsService } from '../organizations/organizations.service';
import { type User } from '../users/entities/user.entity';
import { Purchase } from './entities/purchase.entity';
import { StripeEvent } from './entities/stripe-event.entity';
import { PurchaseKind, PurchaseStatus } from './enums/payment.enums';
import { paymentsConfig } from './payments.config';
import { PaymentsService } from './payments.service';
import { StripeClientService } from './stripe-client.service';

const learner = { id: 'lea', role: UserRole.LEARNER, email: 'lea@x.test' } as User;
const paidCourse = {
  id: 'c1',
  title: 'TypeScript',
  status: CourseStatus.PUBLISHED,
  pricing: CoursePricing.PAID,
  priceCents: 9900,
  currency: 'USD',
};

function pendingPurchase(overrides: Partial<Purchase> = {}): Purchase {
  return {
    id: 'p1',
    userId: 'lea',
    kind: PurchaseKind.COURSE,
    status: PurchaseStatus.PENDING,
    amountCents: 9900,
    currency: 'USD',
    items: [{ courseId: 'c1', title: 'TypeScript', priceCents: 9900 }],
    organizationId: null,
    seats: null,
    stripeCheckoutSessionId: 'cs_1',
    stripePaymentIntentId: null,
    ...overrides,
  } as Purchase;
}

describe('PaymentsService', () => {
  let service: PaymentsService;
  const purchases = {
    create: jest.fn((value: object) => value),
    save: jest.fn((value: object) => Promise.resolve({ id: 'p1', ...value })),
    findOne: jest.fn(),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
  };
  const events = {
    exists: jest.fn().mockResolvedValue(false),
    create: jest.fn((value: object) => value),
    save: jest.fn((value: object) => Promise.resolve(value)),
  };
  const courses = { find: jest.fn().mockResolvedValue([paidCourse]) };
  const stripe = {
    isConfigured: true,
    constructEvent: jest.fn(),
    createCheckoutSession: jest
      .fn()
      .mockResolvedValue({ id: 'cs_1', url: 'https://stripe/checkout' }),
    retrieveCheckoutSession: jest.fn(),
    createRefund: jest.fn().mockResolvedValue({}),
  };
  const coursesService = { findManyByIds: jest.fn() };
  const enrollmentsService = {
    hasAccess: jest.fn().mockResolvedValue(false),
    enrollFromPurchase: jest.fn().mockResolvedValue({}),
    cancelByPurchase: jest.fn().mockResolvedValue(1),
  };
  const organizationsService = {
    requireManage: jest.fn().mockResolvedValue({}),
    grantSeatPack: jest.fn().mockResolvedValue({}),
    removeSeatPacksByPurchase: jest.fn().mockResolvedValue(1),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    stripe.isConfigured = true;
    events.exists.mockResolvedValue(false);
    enrollmentsService.hasAccess.mockResolvedValue(false);
    courses.find.mockResolvedValue([paidCourse]);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const moduleRef = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: getRepositoryToken(Purchase), useValue: purchases },
        { provide: getRepositoryToken(StripeEvent), useValue: events },
        { provide: getRepositoryToken(Course), useValue: courses },
        { provide: StripeClientService, useValue: stripe },
        { provide: CoursesService, useValue: coursesService },
        { provide: EnrollmentsService, useValue: enrollmentsService },
        { provide: OrganizationsService, useValue: organizationsService },
        {
          provide: paymentsConfig.KEY,
          useValue: {
            successUrl: 'https://app/success',
            cancelUrl: 'https://app/cancel',
            currency: 'USD',
            seatPriceCents: 1000,
            maxBundleSize: 3,
          },
        },
      ],
    }).compile();
    service = moduleRef.get(PaymentsService);
  });

  describe('createCheckout', () => {
    it('refuses when Stripe is not configured', async () => {
      stripe.isConfigured = false;

      await expect(
        service.createCheckout(learner, { kind: PurchaseKind.COURSE, courseId: 'c1' }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('creates a pending purchase and a checkout session for a course', async () => {
      const result = await service.createCheckout(learner, {
        kind: PurchaseKind.COURSE,
        courseId: 'c1',
        referralCode: 'ada2026',
      });

      expect(purchases.save).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: PurchaseKind.COURSE,
          status: PurchaseStatus.PENDING,
          amountCents: 9900,
          referralCode: 'ADA2026',
        }),
      );
      expect(stripe.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'payment',
          client_reference_id: 'p1',
          customer_email: 'lea@x.test',
          line_items: [
            expect.objectContaining({
              quantity: 1,
              price_data: expect.objectContaining({ unit_amount: 9900, currency: 'usd' }),
            }),
          ],
          success_url: expect.stringContaining('purchaseId=p1'),
        }),
      );
      expect(result.checkoutUrl).toBe('https://stripe/checkout');
      expect(purchases.save).toHaveBeenLastCalledWith(
        expect.objectContaining({ stripeCheckoutSessionId: 'cs_1' }),
      );
    });

    it('rejects free, unavailable and already owned courses', async () => {
      courses.find.mockResolvedValueOnce([{ ...paidCourse, pricing: CoursePricing.FREE }]);
      await expect(
        service.createCheckout(learner, { kind: PurchaseKind.COURSE, courseId: 'c1' }),
      ).rejects.toBeInstanceOf(BadRequestException);

      courses.find.mockResolvedValueOnce([]);
      await expect(
        service.createCheckout(learner, { kind: PurchaseKind.COURSE, courseId: 'c1' }),
      ).rejects.toBeInstanceOf(NotFoundException);

      enrollmentsService.hasAccess.mockResolvedValueOnce(true);
      await expect(
        service.createCheckout(learner, { kind: PurchaseKind.COURSE, courseId: 'c1' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('sums bundles and rejects mixed currencies or oversized bundles', async () => {
      const second = { ...paidCourse, id: 'c2', title: 'Node', priceCents: 5000 };
      courses.find.mockResolvedValueOnce([paidCourse, second]);
      await service.createCheckout(learner, { kind: PurchaseKind.BUNDLE, courseIds: ['c1', 'c2'] });
      expect(purchases.save).toHaveBeenCalledWith(
        expect.objectContaining({ kind: PurchaseKind.BUNDLE, amountCents: 14900 }),
      );

      courses.find.mockResolvedValueOnce([paidCourse, { ...second, currency: 'EUR' }]);
      await expect(
        service.createCheckout(learner, { kind: PurchaseKind.BUNDLE, courseIds: ['c1', 'c2'] }),
      ).rejects.toThrow('same currency');

      await expect(
        service.createCheckout(learner, {
          kind: PurchaseKind.BUNDLE,
          courseIds: ['c1', 'c2', 'c3', 'c4'],
        }),
      ).rejects.toThrow('limited to 3');
    });

    it('prices seat packs from configuration after an ownership check', async () => {
      await service.createCheckout(learner, {
        kind: PurchaseKind.SEAT_PACK,
        organizationId: 'org',
        seats: 5,
      });

      expect(organizationsService.requireManage).toHaveBeenCalledWith(learner, 'org');
      expect(purchases.save).toHaveBeenCalledWith(
        expect.objectContaining({ kind: PurchaseKind.SEAT_PACK, amountCents: 5000, seats: 5 }),
      );
      expect(stripe.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({ line_items: [expect.objectContaining({ quantity: 5 })] }),
      );
    });

    it('cancels the purchase when Stripe fails', async () => {
      stripe.createCheckoutSession.mockRejectedValueOnce(new Error('stripe down'));

      await expect(
        service.createCheckout(learner, { kind: PurchaseKind.COURSE, courseId: 'c1' }),
      ).rejects.toBeInstanceOf(BadGatewayException);
      expect(purchases.save).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: PurchaseStatus.CANCELLED }),
      );
    });
  });

  it('confirms paid sessions and leaves unpaid ones pending', async () => {
    purchases.findOne.mockResolvedValue(pendingPurchase());
    stripe.retrieveCheckoutSession.mockResolvedValueOnce({ payment_status: 'unpaid' });
    const pending = await service.confirm(learner, 'p1');
    expect(pending.status).toBe(PurchaseStatus.PENDING);

    stripe.retrieveCheckoutSession.mockResolvedValueOnce({
      payment_status: 'paid',
      payment_intent: 'pi_1',
    });
    const paid = await service.confirm(learner, 'p1');
    expect(paid).toMatchObject({ status: PurchaseStatus.PAID, stripePaymentIntentId: 'pi_1' });
    expect(enrollmentsService.enrollFromPurchase).toHaveBeenCalledWith('lea', 'c1', 'p1');
  });

  describe('handleWebhook', () => {
    const completed = {
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_1', payment_status: 'paid', payment_intent: 'pi_1' } },
    };

    it('rejects missing or invalid signatures', async () => {
      await expect(service.handleWebhook(undefined, 'sig')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      stripe.constructEvent.mockImplementationOnce(() => {
        throw new Error('bad signature');
      });
      await expect(service.handleWebhook('{}', 'sig')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('fulfils completed sessions once and records the event', async () => {
      stripe.constructEvent.mockReturnValue(completed);
      purchases.findOne.mockResolvedValue(pendingPurchase());

      const result = await service.handleWebhook('{}', 'sig');

      expect(result).toMatchObject({ handled: true, duplicate: false, eventId: 'evt_1' });
      expect(enrollmentsService.enrollFromPurchase).toHaveBeenCalledWith('lea', 'c1', 'p1');
      expect(events.save).toHaveBeenCalledWith(
        expect.objectContaining({ eventId: 'evt_1', purchaseId: 'p1' }),
      );

      events.exists.mockResolvedValueOnce(true);
      const replay = await service.handleWebhook('{}', 'sig');
      expect(replay).toMatchObject({ handled: false, duplicate: true });
      expect(enrollmentsService.enrollFromPurchase).toHaveBeenCalledTimes(1);
    });

    it('cancels expired sessions and refunds charge refunds', async () => {
      stripe.constructEvent.mockReturnValueOnce({
        id: 'evt_2',
        type: 'checkout.session.expired',
        data: { object: { id: 'cs_1' } },
      });
      purchases.findOne.mockResolvedValueOnce(pendingPurchase());
      await service.handleWebhook('{}', 'sig');
      expect(purchases.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: PurchaseStatus.CANCELLED }),
      );

      stripe.constructEvent.mockReturnValueOnce({
        id: 'evt_3',
        type: 'charge.refunded',
        data: { object: { payment_intent: 'pi_1' } },
      });
      purchases.findOne.mockResolvedValueOnce(
        pendingPurchase({ status: PurchaseStatus.PAID, stripePaymentIntentId: 'pi_1' }),
      );
      const result = await service.handleWebhook('{}', 'sig');
      expect(result.handled).toBe(true);
      expect(enrollmentsService.cancelByPurchase).toHaveBeenCalledWith('p1');
    });

    it('records unrelated events without handling them', async () => {
      stripe.constructEvent.mockReturnValueOnce({
        id: 'evt_4',
        type: 'customer.created',
        data: {},
      });

      const result = await service.handleWebhook('{}', 'sig');

      expect(result).toMatchObject({ handled: false, duplicate: false });
      expect(events.save).toHaveBeenCalledWith(expect.objectContaining({ eventId: 'evt_4' }));
    });
  });

  it('grants seat packs for seat purchases and notifies paid handlers', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    const broken = jest.fn().mockRejectedValue(new Error('nope'));
    service.registerPaidHandler(broken);
    service.registerPaidHandler(handler);

    const purchase = pendingPurchase({
      kind: PurchaseKind.SEAT_PACK,
      items: [],
      organizationId: 'org',
      seats: 3,
    });
    const paid = await service.fulfill(purchase, 'pi_9');

    expect(organizationsService.grantSeatPack).toHaveBeenCalledWith(
      'org',
      { seats: 3, note: 'Purchase p1' },
      SeatPackSource.PURCHASE,
      'p1',
    );
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }));
    await service.fulfill(paid, 'pi_9');
    expect(organizationsService.grantSeatPack).toHaveBeenCalledTimes(1);
  });

  it('refunds paid purchases through Stripe and revokes what they granted', async () => {
    purchases.findOne.mockResolvedValue(pendingPurchase());
    await expect(service.refund('p1', 'dup')).rejects.toBeInstanceOf(BadRequestException);

    purchases.findOne.mockResolvedValue(
      pendingPurchase({ status: PurchaseStatus.PAID, stripePaymentIntentId: 'pi_1' }),
    );
    const refunded = await service.refund('p1', ' Duplicate purchase ');
    expect(stripe.createRefund).toHaveBeenCalledWith('pi_1');
    expect(refunded).toMatchObject({
      status: PurchaseStatus.REFUNDED,
      refundReason: 'Duplicate purchase',
    });
    expect(enrollmentsService.cancelByPurchase).toHaveBeenCalledWith('p1');

    stripe.createRefund.mockRejectedValueOnce(new Error('declined'));
    purchases.findOne.mockResolvedValue(
      pendingPurchase({ status: PurchaseStatus.PAID, stripePaymentIntentId: 'pi_1' }),
    );
    await expect(service.refund('p1', 'again')).rejects.toBeInstanceOf(BadGatewayException);
  });
});

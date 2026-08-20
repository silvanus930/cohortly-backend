import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { UserRole } from '../common/enums/user-role.enum';
import { type Paginated, paginateRepository } from '../common/pagination/pagination';
import { normalizeReferralCode } from '../common/utils/referral-code';
import { appConfig } from '../config/configuration';
import { MailService } from '../mail/mail.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { type Purchase } from '../payments/entities/purchase.entity';
import { type User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import {
  ListLedgerQueryDto,
  ListPartnersQueryDto,
  ListPayoutsQueryDto,
  UpsertPartnerDto,
} from './dto/referral.dto';
import { CommissionEntry } from './entities/commission-entry.entity';
import { PartnerProfile } from './entities/partner-profile.entity';
import { PayoutCycle } from './entities/payout-cycle.entity';
import { Referral } from './entities/referral.entity';
import { CommissionStatus, PartnerStatus, PayoutCycleStatus } from './enums/referral.enums';
import { referralsConfig } from './referrals.config';

export interface ReferralStats {
  code: string;
  link: string;
  signups: number;
  qualified: number;
  earnedCents: number;
  pendingCents: number;
  paidCents: number;
  reversedCents: number;
  currency: string | null;
  commissionRateBps: number;
  payoutThresholdCents: number;
  openCycle: {
    id: string;
    amountCents: number;
    thresholdCents: number;
    status: PayoutCycleStatus;
  } | null;
}

export interface PartnerSummary {
  profile: PartnerProfile;
  openCycleAmountCents: number;
  referralCount: number;
}

@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);

  constructor(
    @InjectRepository(PartnerProfile) private readonly profiles: Repository<PartnerProfile>,
    @InjectRepository(Referral) private readonly referrals: Repository<Referral>,
    @InjectRepository(CommissionEntry) private readonly entries: Repository<CommissionEntry>,
    @InjectRepository(PayoutCycle) private readonly cycles: Repository<PayoutCycle>,
    private readonly usersService: UsersService,
    private readonly mailService: MailService,
    private readonly notificationsService: NotificationsService,
    @Inject(referralsConfig.KEY) private readonly config: ConfigType<typeof referralsConfig>,
    @Inject(appConfig.KEY) private readonly app: ConfigType<typeof appConfig>,
  ) {}

  referralLink(code: string): string {
    return `${this.app.url}/signup?ref=${code}`;
  }

  /** Validates a code before an account is created so signups never half succeed. */
  async resolveReferrer(code: string | undefined): Promise<User | null> {
    if (!code) {
      return null;
    }
    const referrer = await this.usersService.findByReferralCode(normalizeReferralCode(code));
    if (!referrer || !referrer.isActive) {
      throw new BadRequestException('Unknown referral code');
    }
    const profile = await this.profiles.findOne({ where: { userId: referrer.id } });
    if (profile?.status === PartnerStatus.SUSPENDED) {
      throw new BadRequestException('This referral code is no longer active');
    }
    return referrer;
  }

  async attach(referred: User, referrer: User | null): Promise<Referral | null> {
    if (!referrer || referrer.id === referred.id) {
      return null;
    }
    const existing = await this.referrals.findOne({ where: { referredUserId: referred.id } });
    if (existing) {
      return existing;
    }
    const referral = await this.referrals.save(
      this.referrals.create({
        referrerId: referrer.id,
        referredUserId: referred.id,
        code: referrer.referralCode ?? '',
        qualifiedAt: null,
        qualifiedPurchaseId: null,
      }),
    );
    await this.usersService.setReferredBy(referred.id, referrer.id);
    await this.notificationsService.notify(referrer.id, {
      type: NotificationType.GENERIC,
      title: 'Someone signed up with your referral link',
      body: `${referred.firstName} joined using your code. You earn a commission on their first purchase.`,
      data: { referralId: referral.id },
    });
    return referral;
  }

  /** Records a commission for a paid purchase made by a referred user. */
  async recordCommission(purchase: Purchase): Promise<CommissionEntry | null> {
    if (purchase.amountCents <= 0) {
      return null;
    }
    const referral = await this.referrals.findOne({ where: { referredUserId: purchase.userId } });
    if (!referral) {
      return null;
    }
    const existing = await this.entries.findOne({ where: { purchaseId: purchase.id } });
    if (existing) {
      return existing;
    }
    const profile = await this.profiles.findOne({ where: { userId: referral.referrerId } });
    if (profile?.status === PartnerStatus.SUSPENDED) {
      return null;
    }
    const rateBps = profile?.commissionRateBps ?? this.config.defaultCommissionRateBps;
    const amountCents = Math.round((purchase.amountCents * rateBps) / 10000);
    const cycle = await this.openCycle(
      referral.referrerId,
      purchase.currency,
      this.thresholdFor(profile),
    );
    const entry = await this.entries.save(
      this.entries.create({
        partnerId: referral.referrerId,
        referralId: referral.id,
        purchaseId: purchase.id,
        payoutCycleId: cycle.id,
        purchaseAmountCents: purchase.amountCents,
        rateBps,
        amountCents,
        currency: purchase.currency,
        status: CommissionStatus.EARNED,
        reversedAt: null,
        paidAt: null,
      }),
    );
    if (!referral.qualifiedAt) {
      referral.qualifiedAt = new Date();
      referral.qualifiedPurchaseId = purchase.id;
      await this.referrals.save(referral);
    }
    cycle.amountCents += amountCents;
    cycle.entryCount += 1;
    await this.evaluateThreshold(cycle);
    await this.cycles.save(cycle);
    return entry;
  }

  /** Undoes a commission when the purchase is refunded. Paid commissions stay paid. */
  async reverseCommission(purchase: Purchase): Promise<CommissionEntry | null> {
    const entry = await this.entries.findOne({ where: { purchaseId: purchase.id } });
    if (!entry || entry.status !== CommissionStatus.EARNED) {
      return null;
    }
    entry.status = CommissionStatus.REVERSED;
    entry.reversedAt = new Date();
    await this.entries.save(entry);
    if (entry.payoutCycleId) {
      const cycle = await this.cycles.findOne({ where: { id: entry.payoutCycleId } });
      if (cycle && cycle.status !== PayoutCycleStatus.PAID) {
        cycle.amountCents = Math.max(0, cycle.amountCents - entry.amountCents);
        cycle.entryCount = Math.max(0, cycle.entryCount - 1);
        if (cycle.status === PayoutCycleStatus.READY && cycle.amountCents < cycle.thresholdCents) {
          cycle.status = PayoutCycleStatus.OPEN;
          cycle.readyAt = null;
        }
        await this.cycles.save(cycle);
      }
    }
    return entry;
  }

  async stats(user: User): Promise<ReferralStats> {
    const code = await this.usersService.ensureReferralCode(user.id);
    const profile = await this.profiles.findOne({ where: { userId: user.id } });
    const [signups, qualified, rows, openCycle] = await Promise.all([
      this.referrals.count({ where: { referrerId: user.id } }),
      this.referrals.count({ where: { referrerId: user.id, qualifiedAt: Not(IsNull()) } }),
      this.entries
        .createQueryBuilder('entry')
        .select('entry.status', 'status')
        .addSelect('COALESCE(SUM(entry.amountCents), 0)', 'total')
        .addSelect('MAX(entry.currency)', 'currency')
        .where('entry.partnerId = :partnerId', { partnerId: user.id })
        .groupBy('entry.status')
        .getRawMany<{ status: CommissionStatus; total: string; currency: string | null }>(),
      this.cycles.findOne({
        where: {
          partnerId: user.id,
          status: In([PayoutCycleStatus.OPEN, PayoutCycleStatus.READY]),
        },
      }),
    ]);
    const totals = new Map(rows.map((row) => [row.status, Number(row.total)]));
    const pendingCents = totals.get(CommissionStatus.EARNED) ?? 0;
    const paidCents = totals.get(CommissionStatus.PAID) ?? 0;
    return {
      code,
      link: this.referralLink(code),
      signups,
      qualified,
      earnedCents: pendingCents + paidCents,
      pendingCents,
      paidCents,
      reversedCents: totals.get(CommissionStatus.REVERSED) ?? 0,
      currency: rows.find((row) => row.currency)?.currency ?? null,
      commissionRateBps: profile?.commissionRateBps ?? this.config.defaultCommissionRateBps,
      payoutThresholdCents: this.thresholdFor(profile),
      openCycle: openCycle
        ? {
            id: openCycle.id,
            amountCents: openCycle.amountCents,
            thresholdCents: openCycle.thresholdCents,
            status: openCycle.status,
          }
        : null,
    };
  }

  ledger(query: ListLedgerQueryDto): Promise<Paginated<CommissionEntry>> {
    return paginateRepository(
      this.entries,
      {
        where: {
          ...(query.partnerId ? { partnerId: query.partnerId } : {}),
          ...(query.status ? { status: query.status } : {}),
        },
        relations: { referral: { referredUser: true } },
        order: { createdAt: 'DESC' },
      },
      query,
    );
  }

  payouts(query: ListPayoutsQueryDto): Promise<Paginated<PayoutCycle>> {
    return paginateRepository(
      this.cycles,
      {
        where: {
          ...(query.partnerId ? { partnerId: query.partnerId } : {}),
          ...(query.status ? { status: query.status } : {}),
        },
        relations: { partner: true },
        order: { openedAt: 'DESC' },
      },
      query,
    );
  }

  async listPartners(query: ListPartnersQueryDto): Promise<Paginated<PartnerSummary>> {
    const page = await paginateRepository(
      this.profiles,
      {
        where: query.status ? { status: query.status } : {},
        relations: { user: true },
        order: { createdAt: 'DESC' },
      },
      query,
    );
    const partnerIds = page.items.map((profile) => profile.userId);
    const [openCycles, referralRows] =
      partnerIds.length === 0
        ? [[], []]
        : await Promise.all([
            this.cycles.find({
              where: {
                partnerId: In(partnerIds),
                status: In([PayoutCycleStatus.OPEN, PayoutCycleStatus.READY]),
              },
            }),
            this.referrals
              .createQueryBuilder('referral')
              .select('referral.referrerId', 'partnerId')
              .addSelect('COUNT(*)', 'count')
              .where('referral.referrerId IN (:...partnerIds)', { partnerIds })
              .groupBy('referral.referrerId')
              .getRawMany<{ partnerId: string; count: string }>(),
          ]);
    const cycleByPartner = new Map(openCycles.map((cycle) => [cycle.partnerId, cycle.amountCents]));
    const referralsByPartner = new Map(
      referralRows.map((row) => [row.partnerId, Number(row.count)]),
    );
    return {
      items: page.items.map((profile) => ({
        profile,
        openCycleAmountCents: cycleByPartner.get(profile.userId) ?? 0,
        referralCount: referralsByPartner.get(profile.userId) ?? 0,
      })),
      meta: page.meta,
    };
  }

  async upsertPartner(userId: string, dto: UpsertPartnerDto): Promise<PartnerProfile> {
    const user = await this.usersService.findByIdOrFail(userId);
    const profile =
      (await this.profiles.findOne({ where: { userId } })) ??
      this.profiles.create({
        userId,
        commissionRateBps: this.config.defaultCommissionRateBps,
        payoutThresholdCents: null,
        payoutMethod: null,
        payoutDetails: {},
        status: PartnerStatus.ACTIVE,
        notes: null,
      });
    if (dto.commissionRateBps !== undefined) profile.commissionRateBps = dto.commissionRateBps;
    if (dto.payoutThresholdCents !== undefined)
      profile.payoutThresholdCents = dto.payoutThresholdCents;
    if (dto.payoutMethod !== undefined) profile.payoutMethod = dto.payoutMethod;
    if (dto.payoutDetails !== undefined) profile.payoutDetails = dto.payoutDetails;
    if (dto.status !== undefined) profile.status = dto.status;
    if (dto.notes !== undefined) profile.notes = dto.notes;
    const saved = await this.profiles.save(profile);
    await this.usersService.ensureReferralCode(user.id);
    if (user.role === UserRole.LEARNER) {
      await this.usersService.changeRole(user.id, UserRole.PARTNER);
    }
    return saved;
  }

  async markPaid(actor: User, cycleId: string, reference: string): Promise<PayoutCycle> {
    const cycle = await this.cycles.findOne({ where: { id: cycleId } });
    if (!cycle) {
      throw new NotFoundException(`Payout cycle ${cycleId} was not found`);
    }
    if (cycle.status === PayoutCycleStatus.PAID) {
      throw new BadRequestException('This payout cycle is already paid');
    }
    if (cycle.amountCents <= 0) {
      throw new BadRequestException('There is nothing to pay out in this cycle');
    }
    cycle.status = PayoutCycleStatus.PAID;
    cycle.paidAt = new Date();
    cycle.paidById = actor.id;
    cycle.payoutReference = reference.trim();
    const saved = await this.cycles.save(cycle);
    await this.entries.update(
      { payoutCycleId: cycle.id, status: CommissionStatus.EARNED },
      { status: CommissionStatus.PAID, paidAt: new Date() },
    );
    await this.notificationsService.notify(cycle.partnerId, {
      type: NotificationType.GENERIC,
      title: 'Referral payout sent',
      body: `${(cycle.amountCents / 100).toFixed(2)} ${cycle.currency} was paid out (reference ${saved.payoutReference}).`,
      data: { payoutCycleId: cycle.id },
    });
    return saved;
  }

  /** Assigns referral codes to accounts created before codes existed. */
  async backfillCodes(batchSize = 200): Promise<number> {
    let assigned = 0;
    for (;;) {
      const users = await this.usersService.findWithoutReferralCode(batchSize);
      if (users.length === 0) {
        return assigned;
      }
      for (const user of users) {
        await this.usersService.ensureReferralCode(user.id);
        assigned += 1;
      }
    }
  }

  private thresholdFor(profile: PartnerProfile | null): number {
    return profile?.payoutThresholdCents ?? this.config.payoutThresholdCents;
  }

  private async openCycle(
    partnerId: string,
    currency: string,
    thresholdCents: number,
  ): Promise<PayoutCycle> {
    const existing = await this.cycles.findOne({
      where: { partnerId, status: In([PayoutCycleStatus.OPEN, PayoutCycleStatus.READY]) },
    });
    if (existing) {
      return existing;
    }
    return this.cycles.save(
      this.cycles.create({
        partnerId,
        status: PayoutCycleStatus.OPEN,
        currency,
        amountCents: 0,
        entryCount: 0,
        thresholdCents,
        openedAt: new Date(),
        readyAt: null,
        alertSentAt: null,
        paidAt: null,
        paidById: null,
        payoutReference: null,
      }),
    );
  }

  private async evaluateThreshold(cycle: PayoutCycle): Promise<void> {
    if (cycle.amountCents < cycle.thresholdCents) {
      return;
    }
    if (cycle.status === PayoutCycleStatus.OPEN) {
      cycle.status = PayoutCycleStatus.READY;
      cycle.readyAt = new Date();
    }
    if (cycle.alertSentAt) {
      return;
    }
    cycle.alertSentAt = new Date();
    const partner = await this.usersService.findByIdOrFail(cycle.partnerId);
    const partnerName = `${partner.firstName} ${partner.lastName}`.trim();
    const dashboardUrl = `${this.app.url}/admin/referrals/payouts`;
    const superadmins = await this.usersService.findByRole(UserRole.SUPERADMIN);
    await Promise.all(
      superadmins.map((admin) =>
        this.mailService
          .sendPayoutThreshold(
            admin.email,
            partnerName,
            cycle.amountCents,
            cycle.currency,
            cycle.thresholdCents,
            dashboardUrl,
          )
          .catch((error: unknown) => {
            this.logger.warn(`Payout alert email failed for ${admin.email}: ${String(error)}`);
          }),
      ),
    );
    for (const admin of superadmins) {
      await this.notificationsService.notify(admin.id, {
        type: NotificationType.PAYOUT_THRESHOLD,
        title: `${partnerName} is ready for a payout`,
        body: `${(cycle.amountCents / 100).toFixed(2)} ${cycle.currency} in commissions is waiting.`,
        data: { payoutCycleId: cycle.id, partnerId: cycle.partnerId },
      });
    }
    await this.notificationsService.notify(cycle.partnerId, {
      type: NotificationType.PAYOUT_THRESHOLD,
      title: 'You reached the payout threshold',
      body: 'Your commissions will be paid out in the next payout run.',
      data: { payoutCycleId: cycle.id },
    });
  }
}

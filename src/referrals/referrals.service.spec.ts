import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserRole, UserStatus } from '../common/enums/user-role.enum';
import { appConfig } from '../config/configuration';
import { MailService } from '../mail/mail.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { type Purchase } from '../payments/entities/purchase.entity';
import { type User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { CommissionEntry } from './entities/commission-entry.entity';
import { PartnerProfile } from './entities/partner-profile.entity';
import { PayoutCycle } from './entities/payout-cycle.entity';
import { Referral } from './entities/referral.entity';
import { CommissionStatus, PartnerStatus, PayoutCycleStatus } from './enums/referral.enums';
import { referralsConfig } from './referrals.config';
import { ReferralsService } from './referrals.service';

const partner = {
  id: 'partner',
  role: UserRole.PARTNER,
  status: UserStatus.ACTIVE,
  isActive: true,
  referralCode: 'ABCD2345',
  firstName: 'Pat',
  lastName: 'Partner',
  email: 'pat@x.test',
} as unknown as User;
const newcomer = { id: 'new', firstName: 'Nia', lastName: 'New' } as User;
const superadmin = { id: 'root', email: 'root@x.test' } as User;

function repositoryMock(): Record<string, jest.Mock> {
  return {
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn((value: object) => value),
    save: jest.fn((value: object) => Promise.resolve({ id: 'new-id', ...value })),
    update: jest.fn(),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    createQueryBuilder: jest.fn(),
  };
}

describe('ReferralsService', () => {
  let service: ReferralsService;
  const profiles = repositoryMock();
  const referrals = repositoryMock();
  const entries = repositoryMock();
  const cycles = repositoryMock();
  const usersService = {
    findByReferralCode: jest.fn(),
    findByIdOrFail: jest.fn().mockResolvedValue(partner),
    findByRole: jest.fn().mockResolvedValue([superadmin]),
    ensureReferralCode: jest.fn().mockResolvedValue('ABCD2345'),
    setReferredBy: jest.fn(),
    changeRole: jest.fn(),
    findWithoutReferralCode: jest.fn().mockResolvedValue([]),
  };
  const mailService = { sendPayoutThreshold: jest.fn().mockResolvedValue(undefined) };
  const notificationsService = { notify: jest.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    jest.clearAllMocks();
    profiles.findOne.mockResolvedValue(null);
    referrals.findOne.mockResolvedValue(null);
    entries.findOne.mockResolvedValue(null);
    cycles.findOne.mockResolvedValue(null);
    usersService.findByIdOrFail.mockResolvedValue(partner);
    usersService.findByRole.mockResolvedValue([superadmin]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReferralsService,
        { provide: getRepositoryToken(PartnerProfile), useValue: profiles },
        { provide: getRepositoryToken(Referral), useValue: referrals },
        { provide: getRepositoryToken(CommissionEntry), useValue: entries },
        { provide: getRepositoryToken(PayoutCycle), useValue: cycles },
        { provide: UsersService, useValue: usersService },
        { provide: MailService, useValue: mailService },
        { provide: NotificationsService, useValue: notificationsService },
        {
          provide: referralsConfig.KEY,
          useValue: { defaultCommissionRateBps: 2000, payoutThresholdCents: 10000, codeLength: 8 },
        },
        { provide: appConfig.KEY, useValue: { url: 'https://app.test', name: 'Cohortly' } },
      ],
    }).compile();
    service = moduleRef.get(ReferralsService);
  });

  describe('signup', () => {
    it('resolves valid codes and rejects unknown or suspended ones', async () => {
      await expect(service.resolveReferrer(undefined)).resolves.toBeNull();

      usersService.findByReferralCode.mockResolvedValueOnce(null);
      await expect(service.resolveReferrer('nope')).rejects.toBeInstanceOf(BadRequestException);

      usersService.findByReferralCode.mockResolvedValue(partner);
      profiles.findOne.mockResolvedValueOnce({ status: PartnerStatus.SUSPENDED });
      await expect(service.resolveReferrer('abcd2345')).rejects.toThrow('no longer active');

      await expect(service.resolveReferrer(' abcd2345 ')).resolves.toBe(partner);
      expect(usersService.findByReferralCode).toHaveBeenLastCalledWith('ABCD2345');
    });

    it('creates the relationship once and notifies the referrer', async () => {
      await expect(service.attach(newcomer, null)).resolves.toBeNull();
      await expect(service.attach(partner, partner)).resolves.toBeNull();

      const referral = await service.attach(newcomer, partner);
      expect(referral).toMatchObject({
        referrerId: 'partner',
        referredUserId: 'new',
        code: 'ABCD2345',
      });
      expect(usersService.setReferredBy).toHaveBeenCalledWith('new', 'partner');
      expect(notificationsService.notify).toHaveBeenCalledWith('partner', expect.any(Object));

      referrals.findOne.mockResolvedValueOnce({ id: 'existing' });
      await expect(service.attach(newcomer, partner)).resolves.toMatchObject({ id: 'existing' });
    });
  });

  describe('commissions', () => {
    const purchase = { id: 'p1', userId: 'new', amountCents: 10000, currency: 'USD' } as Purchase;
    const referral = { id: 'r1', referrerId: 'partner', referredUserId: 'new', qualifiedAt: null };

    it('ignores purchases without a referral or with no amount', async () => {
      await expect(
        service.recordCommission({ ...purchase, amountCents: 0 } as Purchase),
      ).resolves.toBeNull();
      await expect(service.recordCommission(purchase)).resolves.toBeNull();
    });

    it('records a commission at the partner rate, qualifies the referral and opens a cycle', async () => {
      referrals.findOne.mockResolvedValue({ ...referral });
      profiles.findOne.mockResolvedValue({
        commissionRateBps: 2500,
        status: PartnerStatus.ACTIVE,
        payoutThresholdCents: null,
      });

      const entry = await service.recordCommission(purchase);

      expect(entry).toMatchObject({
        amountCents: 2500,
        rateBps: 2500,
        status: CommissionStatus.EARNED,
      });
      expect(referrals.save).toHaveBeenCalledWith(
        expect.objectContaining({
          qualifiedPurchaseId: 'p1',
          qualifiedAt: expect.any(Date) as Date,
        }),
      );
      expect(cycles.save).toHaveBeenLastCalledWith(
        expect.objectContaining({
          amountCents: 2500,
          entryCount: 1,
          status: PayoutCycleStatus.OPEN,
        }),
      );
      expect(mailService.sendPayoutThreshold).not.toHaveBeenCalled();
    });

    it('marks the cycle ready and alerts superadmins once the threshold is crossed', async () => {
      referrals.findOne.mockResolvedValue({ ...referral, qualifiedAt: new Date() });
      cycles.findOne.mockResolvedValue({
        id: 'cycle',
        partnerId: 'partner',
        status: PayoutCycleStatus.OPEN,
        amountCents: 9000,
        entryCount: 3,
        thresholdCents: 10000,
        currency: 'USD',
        alertSentAt: null,
      });

      await service.recordCommission(purchase);

      expect(cycles.save).toHaveBeenLastCalledWith(
        expect.objectContaining({
          status: PayoutCycleStatus.READY,
          amountCents: 11000,
          alertSentAt: expect.any(Date) as Date,
        }),
      );
      expect(mailService.sendPayoutThreshold).toHaveBeenCalledWith(
        'root@x.test',
        'Pat Partner',
        11000,
        'USD',
        10000,
        'https://app.test/admin/referrals/payouts',
      );
      expect(notificationsService.notify).toHaveBeenCalledWith(
        'root',
        expect.objectContaining({ type: NotificationType.PAYOUT_THRESHOLD }),
      );
    });

    it('does not alert twice and returns existing entries', async () => {
      referrals.findOne.mockResolvedValue({ ...referral });
      cycles.findOne.mockResolvedValue({
        id: 'cycle',
        status: PayoutCycleStatus.READY,
        amountCents: 12000,
        entryCount: 4,
        thresholdCents: 10000,
        currency: 'USD',
        alertSentAt: new Date(),
      });
      await service.recordCommission(purchase);
      expect(mailService.sendPayoutThreshold).not.toHaveBeenCalled();

      entries.findOne.mockResolvedValueOnce({ id: 'existing' });
      await expect(service.recordCommission(purchase)).resolves.toMatchObject({ id: 'existing' });
    });

    it('skips suspended partners', async () => {
      referrals.findOne.mockResolvedValue({ ...referral });
      profiles.findOne.mockResolvedValue({ status: PartnerStatus.SUSPENDED });

      await expect(service.recordCommission(purchase)).resolves.toBeNull();
    });

    it('reverses earned commissions and reopens ready cycles', async () => {
      entries.findOne.mockResolvedValue({
        id: 'e1',
        status: CommissionStatus.EARNED,
        amountCents: 2500,
        payoutCycleId: 'cycle',
      });
      cycles.findOne.mockResolvedValue({
        id: 'cycle',
        status: PayoutCycleStatus.READY,
        amountCents: 11000,
        entryCount: 2,
        thresholdCents: 10000,
        readyAt: new Date(),
      });

      const reversed = await service.reverseCommission(purchase);

      expect(reversed?.status).toBe(CommissionStatus.REVERSED);
      expect(cycles.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: PayoutCycleStatus.OPEN,
          amountCents: 8500,
          entryCount: 1,
        }),
      );

      entries.findOne.mockResolvedValue({ status: CommissionStatus.PAID });
      await expect(service.reverseCommission(purchase)).resolves.toBeNull();
    });
  });

  it('summarises partner stats from the ledger', async () => {
    referrals.count.mockResolvedValueOnce(4).mockResolvedValueOnce(2);
    entries.createQueryBuilder.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        { status: CommissionStatus.EARNED, total: '3000', currency: 'USD' },
        { status: CommissionStatus.PAID, total: '7000', currency: 'USD' },
      ]),
    });
    cycles.findOne.mockResolvedValue({
      id: 'cycle',
      amountCents: 3000,
      thresholdCents: 10000,
      status: PayoutCycleStatus.OPEN,
    });

    const stats = await service.stats(partner);

    expect(stats).toMatchObject({
      code: 'ABCD2345',
      link: 'https://app.test/signup?ref=ABCD2345',
      signups: 4,
      qualified: 2,
      earnedCents: 10000,
      pendingCents: 3000,
      paidCents: 7000,
      reversedCents: 0,
      currency: 'USD',
      commissionRateBps: 2000,
      openCycle: { amountCents: 3000 },
    });
  });

  it('creates partner terms and promotes learners', async () => {
    usersService.findByIdOrFail.mockResolvedValue({ ...partner, role: UserRole.LEARNER });

    const profile = await service.upsertPartner('partner', {
      commissionRateBps: 3000,
      payoutMethod: 'paypal',
    });

    expect(profile).toMatchObject({
      commissionRateBps: 3000,
      payoutMethod: 'paypal',
      status: PartnerStatus.ACTIVE,
    });
    expect(usersService.changeRole).toHaveBeenCalledWith('partner', UserRole.PARTNER);
    expect(usersService.ensureReferralCode).toHaveBeenCalledWith('partner');
  });

  it('marks cycles paid and settles their entries', async () => {
    cycles.findOne.mockResolvedValueOnce(null);
    await expect(service.markPaid(superadmin, 'missing', 'ref')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    cycles.findOne.mockResolvedValueOnce({
      id: 'cycle',
      status: PayoutCycleStatus.PAID,
      amountCents: 100,
    });
    await expect(service.markPaid(superadmin, 'cycle', 'ref')).rejects.toThrow('already paid');

    cycles.findOne.mockResolvedValueOnce({
      id: 'cycle',
      status: PayoutCycleStatus.OPEN,
      amountCents: 0,
    });
    await expect(service.markPaid(superadmin, 'cycle', 'ref')).rejects.toThrow('nothing to pay');

    cycles.findOne.mockResolvedValueOnce({
      id: 'cycle',
      partnerId: 'partner',
      status: PayoutCycleStatus.READY,
      amountCents: 11000,
      currency: 'USD',
    });
    const paid = await service.markPaid(superadmin, 'cycle', ' SEPA-1 ');
    expect(paid).toMatchObject({
      status: PayoutCycleStatus.PAID,
      paidById: 'root',
      payoutReference: 'SEPA-1',
    });
    expect(entries.update).toHaveBeenCalledWith(
      { payoutCycleId: 'cycle', status: CommissionStatus.EARNED },
      expect.objectContaining({ status: CommissionStatus.PAID }),
    );
  });

  it('backfills codes in batches', async () => {
    usersService.findWithoutReferralCode
      .mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }])
      .mockResolvedValueOnce([]);

    await expect(service.backfillCodes(2)).resolves.toBe(2);
    expect(usersService.ensureReferralCode).toHaveBeenCalledTimes(2);
  });
});

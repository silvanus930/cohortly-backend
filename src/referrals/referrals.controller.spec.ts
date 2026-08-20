import { Test } from '@nestjs/testing';
import { UserRole } from '../common/enums/user-role.enum';
import { type User } from '../users/entities/user.entity';
import { CommissionStatus, PartnerStatus, PayoutCycleStatus } from './enums/referral.enums';
import { ReferralsController, ReferralsManageController } from './referrals.controller';
import { ReferralsService } from './referrals.service';

const partner = { id: 'partner', role: UserRole.PARTNER } as User;
const admin = { id: 'admin', role: UserRole.ADMIN } as User;
const entry = {
  id: 'e1',
  purchaseId: 'p1',
  purchaseAmountCents: 10000,
  rateBps: 2000,
  amountCents: 2000,
  currency: 'USD',
  status: CommissionStatus.EARNED,
  referral: { referredUser: { id: 'u', firstName: 'Ref', lastName: 'Erred' } },
  createdAt: new Date(),
  paidAt: null,
  reversedAt: null,
};
const cycle = {
  id: 'cycle',
  partnerId: 'partner',
  partner: { id: 'partner', firstName: 'Pat', lastName: 'P', email: 'pat@x.test' },
  status: PayoutCycleStatus.READY,
  currency: 'USD',
  amountCents: 12000,
  entryCount: 3,
  thresholdCents: 10000,
  openedAt: new Date(),
  readyAt: new Date(),
  paidAt: null,
  payoutReference: null,
};
const profile = {
  userId: 'partner',
  user: {
    id: 'partner',
    firstName: 'Pat',
    lastName: 'P',
    email: 'pat@x.test',
    referralCode: 'ABCD2345',
  },
  commissionRateBps: 2500,
  payoutThresholdCents: null,
  payoutMethod: 'paypal',
  status: PartnerStatus.ACTIVE,
  notes: null,
};

describe('referral controllers', () => {
  const referralsService = {
    stats: jest.fn().mockResolvedValue({ code: 'ABCD2345', signups: 1 }),
    ledger: jest.fn().mockResolvedValue({ items: [entry], meta: { total: 1 } }),
    payouts: jest.fn().mockResolvedValue({ items: [cycle], meta: { total: 1 } }),
    listPartners: jest.fn().mockResolvedValue({
      items: [{ profile, openCycleAmountCents: 12000, referralCount: 4 }],
      meta: { total: 1 },
    }),
    upsertPartner: jest.fn().mockResolvedValue(profile),
    markPaid: jest
      .fn()
      .mockResolvedValue({ ...cycle, status: PayoutCycleStatus.PAID, payoutReference: 'X' }),
  };
  let controller: ReferralsController;
  let manage: ReferralsManageController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [ReferralsController, ReferralsManageController],
      providers: [{ provide: ReferralsService, useValue: referralsService }],
    }).compile();
    controller = moduleRef.get(ReferralsController);
    manage = moduleRef.get(ReferralsManageController);
  });

  it('scopes partner views to the current user', async () => {
    await expect(controller.stats(partner)).resolves.toMatchObject({ code: 'ABCD2345' });

    const ledger = await controller.ledger(partner, {
      page: 1,
      limit: 10,
      partnerId: 'someone-else',
    });
    expect(referralsService.ledger).toHaveBeenCalledWith(
      expect.objectContaining({ partnerId: 'partner' }),
    );
    expect(ledger.items[0]).toMatchObject({
      amountCents: 2000,
      referredUser: { fullName: 'Ref Erred' },
    });

    const payouts = await controller.payouts(partner, { page: 1, limit: 10 });
    expect(referralsService.payouts).toHaveBeenCalledWith(
      expect.objectContaining({ partnerId: 'partner' }),
    );
    expect(payouts.items[0].partner?.email).toBe('pat@x.test');
  });

  it('exposes partner terms, ledgers and payouts to admins', async () => {
    const partners = await manage.partners({ page: 1, limit: 10 });
    expect(partners.items[0]).toMatchObject({
      userId: 'partner',
      user: { referralCode: 'ABCD2345' },
      openCycleAmountCents: 12000,
      referralCount: 4,
    });

    const updated = await manage.upsertPartner('partner', { commissionRateBps: 2500 });
    expect(updated.commissionRateBps).toBe(2500);

    const paid = await manage.markPaid(admin, 'cycle', { reference: 'X' });
    expect(paid.status).toBe(PayoutCycleStatus.PAID);
    expect(referralsService.markPaid).toHaveBeenCalledWith(admin, 'cycle', 'X');
  });
});

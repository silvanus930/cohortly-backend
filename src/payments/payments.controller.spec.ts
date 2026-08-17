import { type RawBodyRequest } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { type Request } from 'express';
import Stripe from 'stripe';
import { UserRole } from '../common/enums/user-role.enum';
import { type User } from '../users/entities/user.entity';
import { PurchaseKind, PurchaseStatus } from './enums/payment.enums';
import { paymentsConfig } from './payments.config';
import { PaymentsController, PurchasesManageController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { StripeClientService } from './stripe-client.service';

const learner = { id: 'lea', role: UserRole.LEARNER } as User;
const purchase = {
  id: 'p1',
  kind: PurchaseKind.COURSE,
  status: PurchaseStatus.PAID,
  amountCents: 9900,
  currency: 'USD',
  items: [],
  organizationId: null,
  seats: null,
  referralCode: null,
  paidAt: new Date(),
  refundedAt: null,
  refundReason: null,
  createdAt: new Date(),
  user: { id: 'lea', email: 'lea@x.test', firstName: 'Lea', lastName: 'R' },
};

describe('payment controllers', () => {
  const paymentsService = {
    createCheckout: jest.fn().mockResolvedValue({ purchase, checkoutUrl: 'https://stripe/x' }),
    confirm: jest.fn().mockResolvedValue(purchase),
    listMine: jest.fn().mockResolvedValue({ items: [purchase], meta: { total: 1 } }),
    findOwnOrFail: jest.fn().mockResolvedValue(purchase),
    handleWebhook: jest.fn().mockResolvedValue({ received: true, handled: true }),
    list: jest.fn().mockResolvedValue({ items: [purchase], meta: { total: 1 } }),
    refund: jest.fn().mockResolvedValue({ ...purchase, status: PurchaseStatus.REFUNDED }),
  };
  let controller: PaymentsController;
  let manage: PurchasesManageController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [PaymentsController, PurchasesManageController],
      providers: [{ provide: PaymentsService, useValue: paymentsService }],
    }).compile();
    controller = moduleRef.get(PaymentsController);
    manage = moduleRef.get(PurchasesManageController);
  });

  it('starts checkouts and confirms purchases without exposing the buyer', async () => {
    const started = await controller.checkout(learner, {
      kind: PurchaseKind.COURSE,
      courseId: 'c1',
    });
    expect(started.checkoutUrl).toBe('https://stripe/x');
    expect(started.purchase).not.toHaveProperty('buyer');

    const confirmed = await controller.confirm(learner, 'p1');
    expect(confirmed.status).toBe(PurchaseStatus.PAID);

    const page = await controller.mine(learner, { page: 1, limit: 10 });
    expect(page.items).toHaveLength(1);
  });

  it('passes the raw body and signature to the webhook handler', async () => {
    const request = { rawBody: Buffer.from('{}') } as RawBodyRequest<Request>;

    await controller.webhook(request, 'sig');

    expect(paymentsService.handleWebhook).toHaveBeenCalledWith(request.rawBody, 'sig');
  });

  it('exposes buyers and refunds to admins', async () => {
    const page = await manage.list({ page: 1, limit: 10 });
    expect(page.items[0].buyer).toMatchObject({ email: 'lea@x.test', fullName: 'Lea R' });

    const refunded = await manage.refund('p1', { reason: 'Duplicate' });
    expect(refunded.status).toBe(PurchaseStatus.REFUNDED);
    expect(paymentsService.refund).toHaveBeenCalledWith('p1', 'Duplicate');
  });
});

describe('StripeClientService', () => {
  it('verifies webhook signatures without an api key', async () => {
    const secret = 'whsec_test_secret';
    const moduleRef = await Test.createTestingModule({
      providers: [
        StripeClientService,
        {
          provide: paymentsConfig.KEY,
          useValue: { stripeSecretKey: '', stripeWebhookSecret: secret },
        },
      ],
    }).compile();
    const client = moduleRef.get(StripeClientService);
    const payload = JSON.stringify({ id: 'evt_1', object: 'event', type: 'ping', data: {} });
    const signature = new Stripe('sk_test_placeholder').webhooks.generateTestHeaderString({
      payload,
      secret,
    });

    expect(client.isConfigured).toBe(false);
    expect(client.hasWebhookSecret).toBe(true);
    expect(client.constructEvent(payload, signature).id).toBe('evt_1');
    expect(() => client.constructEvent(payload, 'bad')).toThrow();
  });
});

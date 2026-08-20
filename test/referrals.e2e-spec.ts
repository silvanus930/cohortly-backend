import { type NestExpressApplication } from '@nestjs/platform-express';
import Stripe from 'stripe';
import { DataSource } from 'typeorm';
import { UserRole } from '../src/common/enums/user-role.enum';
import { MailService } from '../src/mail/mail.service';
import { Purchase } from '../src/payments/entities/purchase.entity';
import { PurchaseKind, PurchaseStatus } from '../src/payments/enums/payment.enums';
import { api, bearer, createUserSession, type TestSession, uniqueEmail } from './utils/auth';
import { publishCourse, type PublishedCourse } from './utils/courses';
import { createTestApp, resetDatabase } from './utils/test-app';

const WEBHOOK_SECRET = 'whsec_test_secret_used_only_by_the_e2e_suite';
const stripe = new Stripe('sk_test_placeholder');

async function payViaWebhook(
  app: NestExpressApplication,
  purchase: Purchase,
  eventId: string,
): Promise<void> {
  const payload = JSON.stringify({
    id: eventId,
    object: 'event',
    type: 'checkout.session.completed',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: null,
    data: {
      object: {
        id: purchase.stripeCheckoutSessionId,
        object: 'checkout.session',
        payment_status: 'paid',
        payment_intent: `pi_${eventId}`,
        client_reference_id: purchase.id,
      },
    },
  });
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  await api(app)
    .post('/api/v1/payments/webhook')
    .set('stripe-signature', signature)
    .set('Content-Type', 'application/json')
    .send(payload)
    .expect(200);
}

describe('Referrals (e2e)', () => {
  let app: NestExpressApplication;
  let admin: TestSession;
  let superadmin: TestSession;
  let partner: TestSession;
  let instructor: TestSession;
  let course: PublishedCourse;
  let referralCode: string;
  let referredToken: string;
  let referredUserId: string;
  let firstPurchaseId: string;
  let cycleId: string;

  async function pendingPurchase(sessionId: string, amountCents: number): Promise<Purchase> {
    const repository = app.get(DataSource).getRepository(Purchase);
    return repository.save(
      repository.create({
        userId: referredUserId,
        kind: PurchaseKind.COURSE,
        status: PurchaseStatus.PENDING,
        amountCents,
        currency: 'USD',
        items: [{ courseId: course.courseId, title: 'Paid Course', priceCents: amountCents }],
        organizationId: null,
        seats: null,
        referralCode,
        stripeCheckoutSessionId: sessionId,
      }),
    );
  }

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    admin = await createUserSession(app, { role: UserRole.ADMIN });
    superadmin = await createUserSession(app, { role: UserRole.SUPERADMIN });
    partner = await createUserSession(app, { firstName: 'Pat', lastName: 'Partner' });
    instructor = await createUserSession(app, { role: UserRole.INSTRUCTOR });
    course = await publishCourse(app, instructor, 'Paid Course', {
      pricing: 'PAID',
      priceCents: 9900,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('gives every user a referral code and link', async () => {
    const me = await api(app)
      .get('/api/v1/referrals/me')
      .set(bearer(partner.accessToken))
      .expect(200);

    referralCode = me.body.data.code as string;
    expect(referralCode).toMatch(/^[A-Z0-9]{8}$/);
    expect(me.body.data.link).toContain(`ref=${referralCode}`);
    expect(me.body.data).toMatchObject({ signups: 0, earnedCents: 0, commissionRateBps: 2000 });
  });

  it('attaches referrals at signup and rejects unknown codes', async () => {
    await api(app)
      .post('/api/v1/auth/register')
      .send({
        email: uniqueEmail('bad'),
        password: 'Passw0rd!',
        firstName: 'B',
        lastName: 'C',
        referralCode: 'NOPE1234',
      })
      .expect(400);

    const signup = await api(app)
      .post('/api/v1/auth/register')
      .send({
        email: uniqueEmail('referred'),
        password: 'Passw0rd!',
        firstName: 'Ref',
        lastName: 'Erred',
        referralCode: referralCode.toLowerCase(),
      })
      .expect(201);
    referredToken = signup.body.data.tokens.accessToken as string;
    referredUserId = signup.body.data.user.id as string;

    const me = await api(app)
      .get('/api/v1/referrals/me')
      .set(bearer(partner.accessToken))
      .expect(200);
    expect(me.body.data).toMatchObject({ signups: 1, qualified: 0 });
  });

  it('lets admins set partner terms and promotes the partner', async () => {
    const profile = await api(app)
      .put(`/api/v1/manage/referrals/partners/${partner.user.id}`)
      .set(bearer(admin.accessToken))
      .send({ commissionRateBps: 2500, payoutThresholdCents: 2000, payoutMethod: 'bank_transfer' })
      .expect(200);
    expect(profile.body.data).toMatchObject({ commissionRateBps: 2500, status: 'ACTIVE' });

    const partnerMe = await api(app)
      .get('/api/v1/auth/me')
      .set(bearer(partner.accessToken))
      .expect(200);
    expect(partnerMe.body.data.role).toBe('PARTNER');
  });

  it('earns a commission on the first paid purchase and alerts superadmins at the threshold', async () => {
    const purchase = await pendingPurchase('cs_ref_1', 9900);
    firstPurchaseId = purchase.id;
    await payViaWebhook(app, purchase, 'evt_ref_1');

    const me = await api(app)
      .get('/api/v1/referrals/me')
      .set(bearer(partner.accessToken))
      .expect(200);
    expect(me.body.data).toMatchObject({
      qualified: 1,
      pendingCents: 2475,
      earnedCents: 2475,
      openCycle: { amountCents: 2475, thresholdCents: 2000, status: 'READY' },
    });
    cycleId = me.body.data.openCycle.id as string;

    const alert = [...app.get(MailService).outbox]
      .reverse()
      .find((m) => m.to === superadmin.user.email);
    expect(alert?.subject).toContain('payout threshold');

    const ledger = await api(app)
      .get('/api/v1/referrals/me/ledger')
      .set(bearer(partner.accessToken))
      .expect(200);
    expect(ledger.body.data[0]).toMatchObject({
      amountCents: 2475,
      status: 'EARNED',
      referredUser: { fullName: 'Ref Erred' },
    });

    await api(app).get('/api/v1/manage/referrals/ledger').set(bearer(referredToken)).expect(403);
  });

  it('pays out a ready cycle', async () => {
    const payouts = await api(app)
      .get('/api/v1/manage/referrals/payouts?status=READY')
      .set(bearer(admin.accessToken))
      .expect(200);
    expect(payouts.body.data[0]).toMatchObject({ id: cycleId, partner: { id: partner.user.id } });

    const paid = await api(app)
      .post(`/api/v1/manage/referrals/payouts/${cycleId}/pay`)
      .set(bearer(admin.accessToken))
      .send({ reference: 'SEPA-2026-1' })
      .expect(200);
    expect(paid.body.data).toMatchObject({ status: 'PAID', payoutReference: 'SEPA-2026-1' });

    const me = await api(app)
      .get('/api/v1/referrals/me')
      .set(bearer(partner.accessToken))
      .expect(200);
    expect(me.body.data).toMatchObject({ pendingCents: 0, paidCents: 2475, openCycle: null });

    const partners = await api(app)
      .get('/api/v1/manage/referrals/partners')
      .set(bearer(admin.accessToken))
      .expect(200);
    expect(partners.body.data[0]).toMatchObject({ userId: partner.user.id, referralCount: 1 });
  });

  it('reverses commissions when a later purchase is refunded but keeps paid ones', async () => {
    await api(app)
      .post(`/api/v1/manage/purchases/${firstPurchaseId}/refund`)
      .set(bearer(admin.accessToken))
      .send({ reason: 'Goodwill' })
      .expect(200);
    const afterPaidRefund = await api(app)
      .get('/api/v1/referrals/me')
      .set(bearer(partner.accessToken))
      .expect(200);
    expect(afterPaidRefund.body.data.paidCents).toBe(2475);

    const second = await pendingPurchase('cs_ref_2', 4000);
    await payViaWebhook(app, second, 'evt_ref_2');
    const withSecond = await api(app)
      .get('/api/v1/referrals/me')
      .set(bearer(partner.accessToken))
      .expect(200);
    expect(withSecond.body.data).toMatchObject({
      pendingCents: 1000,
      openCycle: { amountCents: 1000, status: 'OPEN' },
    });

    await api(app)
      .post(`/api/v1/manage/purchases/${second.id}/refund`)
      .set(bearer(admin.accessToken))
      .send({ reason: 'Duplicate' })
      .expect(200);
    const reversed = await api(app)
      .get('/api/v1/referrals/me')
      .set(bearer(partner.accessToken))
      .expect(200);
    expect(reversed.body.data).toMatchObject({ pendingCents: 0, reversedCents: 1000 });
  });
});

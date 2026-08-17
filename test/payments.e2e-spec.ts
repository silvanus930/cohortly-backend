import { type NestExpressApplication } from '@nestjs/platform-express';
import Stripe from 'stripe';
import { DataSource } from 'typeorm';
import { UserRole } from '../src/common/enums/user-role.enum';
import { Purchase } from '../src/payments/entities/purchase.entity';
import { PurchaseKind, PurchaseStatus } from '../src/payments/enums/payment.enums';
import { api, bearer, createUserSession, type TestSession } from './utils/auth';
import { publishCourse, type PublishedCourse } from './utils/courses';
import { createTestApp, resetDatabase } from './utils/test-app';

interface IdHolder {
  id: string;
}

const WEBHOOK_SECRET = 'whsec_test_secret_used_only_by_the_e2e_suite';
const stripe = new Stripe('sk_test_placeholder');

function signedEvent(event: Record<string, unknown>): { payload: string; signature: string } {
  const payload = JSON.stringify(event);
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  return { payload, signature };
}

function checkoutCompleted(
  eventId: string,
  sessionId: string,
  purchaseId: string,
): Record<string, unknown> {
  return {
    id: eventId,
    object: 'event',
    api_version: '2024-06-20',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: null,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: sessionId,
        object: 'checkout.session',
        payment_status: 'paid',
        payment_intent: `pi_${sessionId}`,
        client_reference_id: purchaseId,
        metadata: { purchaseId },
      },
    },
  };
}

describe('Payments (e2e)', () => {
  let app: NestExpressApplication;
  let admin: TestSession;
  let instructor: TestSession;
  let learner: TestSession;
  let other: TestSession;
  let course: PublishedCourse;
  let purchaseId: string;
  let seatPurchaseId: string;
  let organizationId: string;

  async function pendingPurchase(overrides: Partial<Purchase>): Promise<Purchase> {
    const repository = app.get(DataSource).getRepository(Purchase);
    return repository.save(
      repository.create({
        userId: learner.user.id,
        kind: PurchaseKind.COURSE,
        status: PurchaseStatus.PENDING,
        amountCents: 9900,
        currency: 'USD',
        items: [{ courseId: course.courseId, title: 'Paid Course', priceCents: 9900 }],
        organizationId: null,
        seats: null,
        referralCode: null,
        ...overrides,
      }),
    );
  }

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    admin = await createUserSession(app, { role: UserRole.ADMIN });
    instructor = await createUserSession(app, { role: UserRole.INSTRUCTOR });
    learner = await createUserSession(app);
    other = await createUserSession(app);
    course = await publishCourse(app, instructor, 'Paid Course', {
      pricing: 'PAID',
      priceCents: 9900,
    });
    const organization = await api(app)
      .post('/api/v1/organizations')
      .set(bearer(admin.accessToken))
      .send({ name: 'Buyer Org', ownerId: learner.user.id })
      .expect(201);
    organizationId = (organization.body.data as IdHolder).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports checkout as unavailable when Stripe is not configured', async () => {
    await api(app)
      .post('/api/v1/payments/checkout')
      .set(bearer(learner.accessToken))
      .send({ kind: 'COURSE', courseId: course.courseId })
      .expect(503);
  });

  it('rejects webhooks with a bad signature', async () => {
    const { payload } = signedEvent(checkoutCompleted('evt_bad', 'cs_bad', 'x'));

    await api(app)
      .post('/api/v1/payments/webhook')
      .set('stripe-signature', 't=1,v1=deadbeef')
      .set('Content-Type', 'application/json')
      .send(payload)
      .expect(400);
  });

  it('fulfils a course purchase from a signed webhook exactly once', async () => {
    const purchase = await pendingPurchase({ stripeCheckoutSessionId: 'cs_course_1' });
    purchaseId = purchase.id;
    const { payload, signature } = signedEvent(
      checkoutCompleted('evt_1', 'cs_course_1', purchase.id),
    );

    const first = await api(app)
      .post('/api/v1/payments/webhook')
      .set('stripe-signature', signature)
      .set('Content-Type', 'application/json')
      .send(payload)
      .expect(200);
    expect(first.body.data).toMatchObject({ handled: true, duplicate: false });

    const replay = await api(app)
      .post('/api/v1/payments/webhook')
      .set('stripe-signature', signature)
      .set('Content-Type', 'application/json')
      .send(payload)
      .expect(200);
    expect(replay.body.data).toMatchObject({ handled: false, duplicate: true });

    const mine = await api(app)
      .get('/api/v1/payments/mine')
      .set(bearer(learner.accessToken))
      .expect(200);
    expect(mine.body.data[0]).toMatchObject({ id: purchase.id, status: 'PAID' });

    const enrollments = await api(app)
      .get('/api/v1/enrollments/mine')
      .set(bearer(learner.accessToken))
      .expect(200);
    expect(enrollments.body.data).toHaveLength(1);
    expect(enrollments.body.data[0]).toMatchObject({ source: 'PAID', courseId: course.courseId });

    await api(app)
      .get(`/api/v1/payments/${purchase.id}`)
      .set(bearer(other.accessToken))
      .expect(403);
    const confirmed = await api(app)
      .post(`/api/v1/payments/confirm/${purchase.id}`)
      .set(bearer(learner.accessToken))
      .expect(200);
    expect(confirmed.body.data.status).toBe('PAID');
  });

  it('grants seat packs for seat purchases', async () => {
    const purchase = await pendingPurchase({
      kind: PurchaseKind.SEAT_PACK,
      items: [],
      organizationId,
      seats: 4,
      amountCents: 4 * 19900,
      stripeCheckoutSessionId: 'cs_seats_1',
    });
    seatPurchaseId = purchase.id;
    const { payload, signature } = signedEvent(
      checkoutCompleted('evt_2', 'cs_seats_1', purchase.id),
    );

    await api(app)
      .post('/api/v1/payments/webhook')
      .set('stripe-signature', signature)
      .set('Content-Type', 'application/json')
      .send(payload)
      .expect(200);

    const dashboard = await api(app)
      .get(`/api/v1/organizations/${organizationId}/dashboard`)
      .set(bearer(learner.accessToken))
      .expect(200);
    expect(dashboard.body.data.seats.totalSeats).toBe(4);
  });

  it('lets admins refund purchases and revokes what they granted', async () => {
    await api(app)
      .post(`/api/v1/manage/purchases/${purchaseId}/refund`)
      .set(bearer(learner.accessToken))
      .send({ reason: 'Changed my mind' })
      .expect(403);

    const refunded = await api(app)
      .post(`/api/v1/manage/purchases/${purchaseId}/refund`)
      .set(bearer(admin.accessToken))
      .send({ reason: 'Changed my mind' })
      .expect(200);
    expect(refunded.body.data).toMatchObject({
      status: 'REFUNDED',
      buyer: { id: learner.user.id },
    });

    const cancelled = await api(app)
      .get('/api/v1/enrollments/mine?status=CANCELLED')
      .set(bearer(learner.accessToken))
      .expect(200);
    expect(cancelled.body.data).toHaveLength(1);

    await api(app)
      .post(`/api/v1/manage/purchases/${seatPurchaseId}/refund`)
      .set(bearer(admin.accessToken))
      .send({ reason: 'Contract cancelled' })
      .expect(200);
    const dashboard = await api(app)
      .get(`/api/v1/organizations/${organizationId}/dashboard`)
      .set(bearer(learner.accessToken))
      .expect(200);
    expect(dashboard.body.data.seats.totalSeats).toBe(0);

    const all = await api(app)
      .get('/api/v1/manage/purchases?status=REFUNDED')
      .set(bearer(admin.accessToken))
      .expect(200);
    expect(all.body.meta.total).toBe(2);
  });
});

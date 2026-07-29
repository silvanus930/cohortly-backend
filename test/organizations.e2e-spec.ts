import { type NestExpressApplication } from '@nestjs/platform-express';
import { UserRole } from '../src/common/enums/user-role.enum';
import { MailService } from '../src/mail/mail.service';
import { publishCourse } from './utils/courses';
import { api, bearer, createUserSession, type TestSession } from './utils/auth';
import { createTestApp, resetDatabase } from './utils/test-app';

interface IdHolder {
  id: string;
}

describe('Organizations (e2e)', () => {
  let app: NestExpressApplication;
  let admin: TestSession;
  let owner: TestSession;
  let learner: TestSession;
  let outsider: TestSession;
  let instructor: TestSession;
  let organizationId: string;
  let courseId: string;
  let inviteToken: string;
  let assignmentId: string;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    admin = await createUserSession(app, { role: UserRole.ADMIN });
    owner = await createUserSession(app, { firstName: 'Olga', lastName: 'Owner' });
    learner = await createUserSession(app, { firstName: 'Lars', lastName: 'Learner' });
    outsider = await createUserSession(app);
    instructor = await createUserSession(app, { role: UserRole.INSTRUCTOR });
    courseId = (await publishCourse(app, instructor, 'Org Seat Course')).courseId;
  });

  afterAll(async () => {
    await app.close();
  });

  it('lets admins create an organization whose owner becomes an org admin', async () => {
    await api(app)
      .post('/api/v1/organizations')
      .set(bearer(owner.accessToken))
      .send({ name: 'Acme' })
      .expect(403);

    const response = await api(app)
      .post('/api/v1/organizations')
      .set(bearer(admin.accessToken))
      .send({ name: 'Acme Corp', ownerId: owner.user.id, website: 'https://acme.example' })
      .expect(201);
    organizationId = (response.body.data as IdHolder).id;
    expect(response.body.data).toMatchObject({ slug: 'acme-corp', ownerId: owner.user.id });

    const me = await api(app).get('/api/v1/auth/me').set(bearer(owner.accessToken)).expect(200);
    expect(me.body.data.role).toBe('ORG_ADMIN');
  });

  it('exposes the organization to members and hides it from outsiders', async () => {
    const view = await api(app)
      .get(`/api/v1/organizations/${organizationId}`)
      .set(bearer(owner.accessToken))
      .expect(200);
    expect(view.body.data).toMatchObject({ canManage: true, membershipRole: 'ADMIN' });

    await api(app)
      .get(`/api/v1/organizations/${organizationId}`)
      .set(bearer(outsider.accessToken))
      .expect(403);
  });

  it('invites a member by email and accepts through the emailed token', async () => {
    const invited = await api(app)
      .post(`/api/v1/organizations/${organizationId}/invitations`)
      .set(bearer(owner.accessToken))
      .send({ email: learner.user.email })
      .expect(201);
    expect(invited.body.data).toMatchObject({ status: 'PENDING', role: 'MEMBER' });
    expect(invited.body.data).not.toHaveProperty('tokenHash');

    const mail = [...app.get(MailService).outbox]
      .reverse()
      .find((m) => m.to === learner.user.email);
    inviteToken = /token=([A-Za-z0-9_-]+)/.exec(mail?.text ?? '')?.[1] ?? '';
    expect(inviteToken.length).toBeGreaterThan(30);

    await api(app)
      .post('/api/v1/organizations/invitations/accept')
      .set(bearer(outsider.accessToken))
      .send({ token: inviteToken })
      .expect(403);

    const accepted = await api(app)
      .post('/api/v1/organizations/invitations/accept')
      .set(bearer(learner.accessToken))
      .send({ token: inviteToken })
      .expect(200);
    expect(accepted.body.data).toMatchObject({ organizationId, role: 'MEMBER' });

    await api(app)
      .post('/api/v1/organizations/invitations/accept')
      .set(bearer(learner.accessToken))
      .send({ token: inviteToken })
      .expect(400);

    const mine = await api(app).get('/api/v1/organizations/mine').set(bearer(learner.accessToken));
    expect(mine.body.data[0]).toMatchObject({
      role: 'MEMBER',
      organization: { id: organizationId },
    });
  });

  it('assigns seats from granted packs and enforces the limit', async () => {
    await api(app)
      .post(`/api/v1/organizations/${organizationId}/seats`)
      .set(bearer(owner.accessToken))
      .send({ userId: learner.user.id, courseId })
      .expect(400);

    await api(app)
      .post(`/api/v1/organizations/${organizationId}/seat-packs`)
      .set(bearer(owner.accessToken))
      .send({ seats: 1 })
      .expect(403);
    await api(app)
      .post(`/api/v1/organizations/${organizationId}/seat-packs`)
      .set(bearer(admin.accessToken))
      .send({ seats: 1, note: 'Pilot contract' })
      .expect(201);

    const assigned = await api(app)
      .post(`/api/v1/organizations/${organizationId}/seats`)
      .set(bearer(owner.accessToken))
      .send({ userId: learner.user.id, courseId })
      .expect(201);
    assignmentId = (assigned.body.data as IdHolder).id;
    expect(assigned.body.data.user.id).toBe(learner.user.id);
    expect(assigned.body.data.course.id).toBe(courseId);

    await api(app)
      .post(`/api/v1/organizations/${organizationId}/seats`)
      .set(bearer(owner.accessToken))
      .send({ userId: learner.user.id, courseId })
      .expect(409);
    await api(app)
      .post(`/api/v1/organizations/${organizationId}/seats`)
      .set(bearer(owner.accessToken))
      .send({ userId: outsider.user.id, courseId })
      .expect(400);
  });

  it('reports seat usage on the dashboard and frees seats on revoke', async () => {
    const before = await api(app)
      .get(`/api/v1/organizations/${organizationId}/dashboard`)
      .set(bearer(owner.accessToken))
      .expect(200);
    expect(before.body.data.seats).toEqual({ totalSeats: 1, usedSeats: 1, availableSeats: 0 });
    expect(before.body.data.members).toEqual({ total: 2, admins: 1 });
    expect(before.body.data.courses).toEqual([
      { courseId, title: 'Org Seat Course', seatsUsed: 1 },
    ]);

    await api(app)
      .delete(`/api/v1/organizations/${organizationId}/seats/${assignmentId}`)
      .set(bearer(owner.accessToken))
      .expect(204);

    const after = await api(app)
      .get(`/api/v1/organizations/${organizationId}/dashboard`)
      .set(bearer(owner.accessToken))
      .expect(200);
    expect(after.body.data.seats.usedSeats).toBe(0);
  });

  it('lists organizations for platform admins only', async () => {
    const page = await api(app)
      .get('/api/v1/organizations')
      .set(bearer(admin.accessToken))
      .expect(200);
    expect(page.body.meta.total).toBe(1);

    await api(app).get('/api/v1/organizations').set(bearer(owner.accessToken)).expect(403);
  });
});

import { type NestExpressApplication } from '@nestjs/platform-express';
import { UserRole } from '../src/common/enums/user-role.enum';
import { api, bearer, createUserSession, type TestSession } from './utils/auth';
import { publishCourse } from './utils/courses';
import { createTestApp, resetDatabase } from './utils/test-app';

interface IdHolder {
  id: string;
}

describe('Cohorts (e2e)', () => {
  let app: NestExpressApplication;
  let instructor: TestSession;
  let learnerA: TestSession;
  let learnerB: TestSession;
  let courseId: string;
  let cohortId: string;
  let sessionId: string;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    instructor = await createUserSession(app, { role: UserRole.INSTRUCTOR });
    learnerA = await createUserSession(app, { firstName: 'Ann', lastName: 'A' });
    learnerB = await createUserSession(app, { firstName: 'Ben', lastName: 'B' });
    courseId = (await publishCourse(app, instructor, 'Cohort Course')).courseId;
    for (const learner of [learnerA, learnerB]) {
      await api(app)
        .post('/api/v1/enrollments')
        .set(bearer(learner.accessToken))
        .send({ courseId })
        .expect(201);
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a cohort with sessions for a course', async () => {
    await api(app)
      .post(`/api/v1/manage/courses/${courseId}/cohorts`)
      .set(bearer(instructor.accessToken))
      .send({
        title: 'Broken',
        startsAt: '2030-02-01T00:00:00Z',
        endsAt: '2030-01-01T00:00:00Z',
        capacity: 1,
      })
      .expect(400);

    const created = await api(app)
      .post(`/api/v1/manage/courses/${courseId}/cohorts`)
      .set(bearer(instructor.accessToken))
      .send({
        title: 'Evening cohort',
        startsAt: '2030-01-01T18:00:00Z',
        endsAt: '2030-03-01T20:00:00Z',
        capacity: 1,
        timezone: 'Europe/Berlin',
      })
      .expect(201);
    cohortId = (created.body.data as IdHolder).id;
    expect(created.body.data).toMatchObject({
      status: 'SCHEDULED',
      seatsLeft: 1,
      instructor: { id: instructor.user.id },
    });

    const session = await api(app)
      .post(`/api/v1/manage/cohorts/${cohortId}/sessions`)
      .set(bearer(instructor.accessToken))
      .send({
        title: 'Kickoff',
        startsAt: '2020-01-01T18:00:00Z',
        endsAt: '2020-01-01T19:00:00Z',
        meetingUrl: 'https://meet.example/kickoff',
      })
      .expect(201);
    sessionId = (session.body.data as IdHolder).id;

    await api(app)
      .post(`/api/v1/manage/courses/${courseId}/cohorts`)
      .set(bearer(learnerA.accessToken))
      .send({
        title: 'Nope',
        startsAt: '2030-01-01T00:00:00Z',
        endsAt: '2030-02-01T00:00:00Z',
        capacity: 1,
      })
      .expect(403);
  });

  it('lists the cohort publicly with its sessions', async () => {
    const list = await api(app).get(`/api/v1/cohorts?courseId=${courseId}`).expect(200);
    expect(list.body.data).toHaveLength(1);

    const detail = await api(app).get(`/api/v1/cohorts/${cohortId}`).expect(200);
    expect(detail.body.data.sessions).toHaveLength(1);
    expect(detail.body.data.sessions[0].meetingUrl).toBe('https://meet.example/kickoff');
  });

  it('enrolls up to capacity and waitlists the rest', async () => {
    const first = await api(app)
      .post(`/api/v1/cohorts/${cohortId}/join`)
      .set(bearer(learnerA.accessToken))
      .expect(200);
    expect(first.body.data).toMatchObject({ status: 'ENROLLED', waitlistPosition: null });

    const second = await api(app)
      .post(`/api/v1/cohorts/${cohortId}/join`)
      .set(bearer(learnerB.accessToken))
      .expect(200);
    expect(second.body.data).toMatchObject({ status: 'WAITLISTED', waitlistPosition: 1 });

    await api(app)
      .post(`/api/v1/cohorts/${cohortId}/join`)
      .set(bearer(learnerB.accessToken))
      .expect(409);

    const detail = await api(app).get(`/api/v1/cohorts/${cohortId}`).expect(200);
    expect(detail.body.data).toMatchObject({ enrolledCount: 1, waitlistCount: 1, seatsLeft: 0 });

    const mine = await api(app)
      .get('/api/v1/cohorts/mine')
      .set(bearer(learnerB.accessToken))
      .expect(200);
    expect(mine.body.data[0]).toMatchObject({ status: 'WAITLISTED', cohort: { id: cohortId } });
  });

  it('promotes the first waitlisted learner when a seat frees up', async () => {
    const left = await api(app)
      .post(`/api/v1/cohorts/${cohortId}/leave`)
      .set(bearer(learnerA.accessToken))
      .expect(200);
    expect(left.body.data.promoted).toMatchObject({
      status: 'ENROLLED',
      user: { id: learnerB.user.id },
    });

    const roster = await api(app)
      .get(`/api/v1/manage/cohorts/${cohortId}/roster`)
      .set(bearer(instructor.accessToken))
      .expect(200);
    const byUser = Object.fromEntries(
      (roster.body.data as { user: { id: string; email?: string }; status: string }[]).map((m) => [
        m.user.id,
        m,
      ]),
    );
    expect(byUser[learnerB.user.id].status).toBe('ENROLLED');
    expect(byUser[learnerA.user.id].status).toBe('DROPPED');
    expect(byUser[learnerB.user.id].user.email).toBe(learnerB.user.email);

    await api(app)
      .post(`/api/v1/cohorts/${cohortId}/leave`)
      .set(bearer(learnerA.accessToken))
      .expect(404);
  });

  it('marks attendance for enrolled learners and summarises it', async () => {
    await api(app)
      .put(`/api/v1/manage/sessions/${sessionId}/attendance`)
      .set(bearer(instructor.accessToken))
      .send({ entries: [{ userId: learnerA.user.id, status: 'PRESENT' }] })
      .expect(400);

    const marked = await api(app)
      .put(`/api/v1/manage/sessions/${sessionId}/attendance`)
      .set(bearer(instructor.accessToken))
      .send({ entries: [{ userId: learnerB.user.id, status: 'LATE', note: 'Train delay' }] })
      .expect(200);
    expect(marked.body.data[0]).toMatchObject({ status: 'LATE', note: 'Train delay' });

    const summary = await api(app)
      .get(`/api/v1/manage/cohorts/${cohortId}/attendance-summary`)
      .set(bearer(instructor.accessToken))
      .expect(200);
    expect(summary.body.data.sessionsHeld).toBe(1);
    expect(summary.body.data.members).toEqual([
      expect.objectContaining({ userId: learnerB.user.id, late: 1, attendanceRate: 100 }),
    ]);
  });

  it('protects capacity and closes joins on cancel', async () => {
    await api(app)
      .patch(`/api/v1/manage/cohorts/${cohortId}`)
      .set(bearer(instructor.accessToken))
      .send({ capacity: 0 })
      .expect(400);

    await api(app)
      .post(`/api/v1/manage/cohorts/${cohortId}/cancel`)
      .set(bearer(instructor.accessToken))
      .expect(200);

    await api(app)
      .post(`/api/v1/cohorts/${cohortId}/join`)
      .set(bearer(learnerA.accessToken))
      .expect(400);
    const list = await api(app).get(`/api/v1/cohorts?courseId=${courseId}`).expect(200);
    expect(list.body.data).toHaveLength(0);
  });
});

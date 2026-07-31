import { type NestExpressApplication } from '@nestjs/platform-express';
import { UserRole } from '../src/common/enums/user-role.enum';
import { api, bearer, createUserSession, type TestSession } from './utils/auth';
import { publishCourse, type PublishedCourse } from './utils/courses';
import { createTestApp, resetDatabase } from './utils/test-app';

interface IdHolder {
  id: string;
}

describe('Enrollments (e2e)', () => {
  let app: NestExpressApplication;
  let admin: TestSession;
  let instructor: TestSession;
  let learner: TestSession;
  let outsider: TestSession;
  let freeCourse: PublishedCourse;
  let paidCourse: PublishedCourse;
  let enrollmentId: string;
  let paidEnrollmentId: string;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    admin = await createUserSession(app, { role: UserRole.ADMIN });
    instructor = await createUserSession(app, { role: UserRole.INSTRUCTOR });
    learner = await createUserSession(app, { firstName: 'Lea', lastName: 'Rner' });
    outsider = await createUserSession(app);
    freeCourse = await publishCourse(app, instructor, 'Free Course', { lessons: 2 });
    paidCourse = await publishCourse(app, instructor, 'Paid Course', {
      pricing: 'PAID',
      priceCents: 9900,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('enrolls in a free course once', async () => {
    const response = await api(app)
      .post('/api/v1/enrollments')
      .set(bearer(learner.accessToken))
      .send({ courseId: freeCourse.courseId })
      .expect(201);
    enrollmentId = (response.body.data as IdHolder).id;
    expect(response.body.data).toMatchObject({
      source: 'FREE',
      status: 'ACTIVE',
      totalLessons: 2,
      course: { slug: freeCourse.slug },
    });

    await api(app)
      .post('/api/v1/enrollments')
      .set(bearer(learner.accessToken))
      .send({ courseId: freeCourse.courseId })
      .expect(409);
  });

  it('requires payment or a seat for paid courses', async () => {
    await api(app)
      .post('/api/v1/enrollments')
      .set(bearer(learner.accessToken))
      .send({ courseId: paidCourse.courseId })
      .expect(402);

    const organization = await api(app)
      .post('/api/v1/organizations')
      .set(bearer(admin.accessToken))
      .send({ name: 'Seat Org', ownerId: learner.user.id })
      .expect(201);
    const organizationId = (organization.body.data as IdHolder).id;
    await api(app)
      .post(`/api/v1/organizations/${organizationId}/seat-packs`)
      .set(bearer(admin.accessToken))
      .send({ seats: 2 })
      .expect(201);
    await api(app)
      .post(`/api/v1/organizations/${organizationId}/seats`)
      .set(bearer(learner.accessToken))
      .send({ userId: learner.user.id, courseId: paidCourse.courseId })
      .expect(201);

    const response = await api(app)
      .post('/api/v1/enrollments')
      .set(bearer(learner.accessToken))
      .send({ courseId: paidCourse.courseId })
      .expect(201);
    paidEnrollmentId = (response.body.data as IdHolder).id;
    expect(response.body.data.source).toBe('SEAT');
  });

  it('unlocks lesson content in the catalog for enrolled learners', async () => {
    const asLearner = await api(app)
      .get(`/api/v1/catalog/courses/${freeCourse.slug}`)
      .set(bearer(learner.accessToken))
      .expect(200);
    expect(asLearner.body.data.modules[0].lessons[0].body).toBe('Hello');

    const asOutsider = await api(app)
      .get(`/api/v1/catalog/courses/${freeCourse.slug}`)
      .set(bearer(outsider.accessToken))
      .expect(200);
    expect(asOutsider.body.data.modules[0].lessons[0].body).toBeNull();
  });

  it('tracks lesson progress up to course completion', async () => {
    const [first, second] = freeCourse.lessonIds;

    const started = await api(app)
      .put(`/api/v1/enrollments/lessons/${first}/progress`)
      .set(bearer(learner.accessToken))
      .send({ status: 'IN_PROGRESS', positionSeconds: 42 })
      .expect(200);
    expect(started.body.data.progress).toMatchObject({
      status: 'IN_PROGRESS',
      positionSeconds: 42,
    });
    expect(started.body.data.enrollment.progressPercent).toBe(0);

    const half = await api(app)
      .put(`/api/v1/enrollments/lessons/${first}/progress`)
      .set(bearer(learner.accessToken))
      .send({ status: 'COMPLETED' })
      .expect(200);
    expect(half.body.data.enrollment).toMatchObject({ progressPercent: 50, completedLessons: 1 });

    const outline = await api(app)
      .get(`/api/v1/enrollments/courses/${freeCourse.courseId}/progress`)
      .set(bearer(learner.accessToken))
      .expect(200);
    expect(outline.body.data.nextLesson.id).toBe(second);
    expect(outline.body.data.modules[0].lessons[0].status).toBe('COMPLETED');

    const done = await api(app)
      .put(`/api/v1/enrollments/lessons/${second}/progress`)
      .set(bearer(learner.accessToken))
      .send({ status: 'COMPLETED' })
      .expect(200);
    expect(done.body.data.enrollment).toMatchObject({ progressPercent: 100, status: 'COMPLETED' });
    expect(done.body.data.enrollment.completedAt).toEqual(expect.any(String));

    await api(app)
      .put(`/api/v1/enrollments/lessons/${first}/progress`)
      .set(bearer(outsider.accessToken))
      .send({ status: 'COMPLETED' })
      .expect(403);
  });

  it('lists in progress and completed enrollments, continue learning and streaks', async () => {
    const completed = await api(app)
      .get('/api/v1/enrollments/mine?status=COMPLETED')
      .set(bearer(learner.accessToken))
      .expect(200);
    expect((completed.body.data as IdHolder[]).map((e) => e.id)).toEqual([enrollmentId]);

    const active = await api(app)
      .get('/api/v1/enrollments/mine?status=ACTIVE')
      .set(bearer(learner.accessToken))
      .expect(200);
    expect((active.body.data as IdHolder[]).map((e) => e.id)).toEqual([paidEnrollmentId]);

    const next = await api(app)
      .get('/api/v1/enrollments/continue')
      .set(bearer(learner.accessToken))
      .expect(200);
    expect(next.body.data.enrollment.id).toBe(paidEnrollmentId);
    expect(next.body.data.nextLesson.id).toBe(paidCourse.lessonIds[0]);

    const streak = await api(app)
      .get('/api/v1/enrollments/streak')
      .set(bearer(learner.accessToken))
      .expect(200);
    expect(streak.body.data).toMatchObject({
      currentStreak: 1,
      longestStreak: 1,
      activeDaysLast30: 1,
    });

    const none = await api(app)
      .get('/api/v1/enrollments/continue')
      .set(bearer(outsider.accessToken))
      .expect(200);
    expect(none.body.data).toBeNull();
  });

  it('shows instructors their learners and lets learners cancel', async () => {
    const roster = await api(app)
      .get(`/api/v1/manage/courses/${freeCourse.courseId}/enrollments?search=lea`)
      .set(bearer(instructor.accessToken))
      .expect(200);
    expect(roster.body.data[0]).toMatchObject({
      progressPercent: 100,
      learner: { email: learner.user.email },
    });

    await api(app)
      .post(`/api/v1/enrollments/${paidEnrollmentId}/cancel`)
      .set(bearer(outsider.accessToken))
      .expect(403);
    const cancelled = await api(app)
      .post(`/api/v1/enrollments/${paidEnrollmentId}/cancel`)
      .set(bearer(learner.accessToken))
      .expect(200);
    expect(cancelled.body.data.status).toBe('CANCELLED');

    const again = await api(app)
      .post('/api/v1/enrollments')
      .set(bearer(learner.accessToken))
      .send({ courseId: paidCourse.courseId })
      .expect(201);
    expect(again.body.data.id).toBe(paidEnrollmentId);
  });

  it('blocks cohort joins for learners who are not enrolled', async () => {
    const cohort = await api(app)
      .post(`/api/v1/manage/courses/${freeCourse.courseId}/cohorts`)
      .set(bearer(instructor.accessToken))
      .send({
        title: 'Cohort',
        startsAt: '2030-01-01T00:00:00Z',
        endsAt: '2030-02-01T00:00:00Z',
        capacity: 5,
      })
      .expect(201);
    const cohortId = (cohort.body.data as IdHolder).id;

    await api(app)
      .post(`/api/v1/cohorts/${cohortId}/join`)
      .set(bearer(outsider.accessToken))
      .expect(403);
    await api(app)
      .post(`/api/v1/cohorts/${cohortId}/join`)
      .set(bearer(learner.accessToken))
      .expect(200);
  });
});

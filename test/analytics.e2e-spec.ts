import { type NestExpressApplication } from '@nestjs/platform-express';
import { UserRole } from '../src/common/enums/user-role.enum';
import { api, bearer, createUserSession, type TestSession } from './utils/auth';
import { publishCourse, type PublishedCourse } from './utils/courses';
import { createTestApp, resetDatabase } from './utils/test-app';

interface IdHolder {
  id: string;
}

describe('Analytics (e2e)', () => {
  let app: NestExpressApplication;
  let admin: TestSession;
  let instructor: TestSession;
  let otherInstructor: TestSession;
  let learner: TestSession;
  let course: PublishedCourse;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    admin = await createUserSession(app, { role: UserRole.ADMIN });
    instructor = await createUserSession(app, { role: UserRole.INSTRUCTOR });
    otherInstructor = await createUserSession(app, { role: UserRole.INSTRUCTOR });
    learner = await createUserSession(app);
    course = await publishCourse(app, instructor, 'Analytics Course', { lessons: 1 });

    const cohort = await api(app)
      .post(`/api/v1/manage/courses/${course.courseId}/cohorts`)
      .set(bearer(instructor.accessToken))
      .send({
        title: 'Cohort',
        startsAt: '2026-01-01T00:00:00Z',
        endsAt: '2036-01-01T00:00:00Z',
        capacity: 5,
      })
      .expect(201);
    await api(app)
      .post('/api/v1/enrollments')
      .set(bearer(learner.accessToken))
      .send({ courseId: course.courseId, cohortId: (cohort.body.data as IdHolder).id })
      .expect(201);
    await api(app)
      .put(`/api/v1/enrollments/lessons/${course.lessonIds[0]}/progress`)
      .set(bearer(learner.accessToken))
      .send({ status: 'COMPLETED' })
      .expect(200);
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports the platform overview to admins only', async () => {
    await api(app)
      .get('/api/v1/manage/analytics/overview')
      .set(bearer(instructor.accessToken))
      .expect(403);

    const overview = await api(app)
      .get('/api/v1/manage/analytics/overview')
      .set(bearer(admin.accessToken))
      .expect(200);
    expect(overview.body.data).toMatchObject({
      users: 4,
      publishedCourses: 1,
      completedEnrollments: 1,
      activeCohorts: 1,
      revenueCents: 0,
    });
  });

  it('serves time series, top courses and cohort completion', async () => {
    const enrollments = await api(app)
      .get('/api/v1/manage/analytics/enrollments?granularity=day')
      .set(bearer(admin.accessToken))
      .expect(200);
    expect(enrollments.body.data).toHaveLength(1);
    expect(enrollments.body.data[0]).toMatchObject({ enrollments: 1, completions: 1 });

    const revenue = await api(app)
      .get('/api/v1/manage/analytics/revenue?granularity=month')
      .set(bearer(admin.accessToken))
      .expect(200);
    expect(revenue.body.data).toEqual([]);

    const top = await api(app)
      .get('/api/v1/manage/analytics/top-courses?limit=3')
      .set(bearer(admin.accessToken))
      .expect(200);
    expect(top.body.data[0]).toMatchObject({
      courseId: course.courseId,
      enrollments: 1,
      completions: 1,
    });

    const cohorts = await api(app)
      .get('/api/v1/manage/analytics/cohort-completion?from=2026-01-01&to=2036-12-31')
      .set(bearer(admin.accessToken))
      .expect(200);
    expect(cohorts.body.data[0]).toMatchObject({
      title: 'Cohort',
      enrolled: 1,
      completed: 1,
      completionRate: 100,
    });

    await api(app)
      .get('/api/v1/manage/analytics/revenue?from=2026-05-01&to=2026-01-01')
      .set(bearer(admin.accessToken))
      .expect(400);
  });

  it('gives instructors their own performance and admins the reset', async () => {
    await api(app)
      .get(`/api/v1/manage/instructors/${instructor.user.id}/performance`)
      .set(bearer(otherInstructor.accessToken))
      .expect(403);

    const before = await api(app)
      .get(`/api/v1/manage/instructors/${instructor.user.id}/performance`)
      .set(bearer(instructor.accessToken))
      .expect(200);
    expect(before.body.data).toMatchObject({
      since: null,
      publishedCourses: 1,
      cohortsRun: 1,
      enrollments: 1,
      completions: 1,
      completionRate: 100,
      distinctLearners: 1,
    });

    await api(app)
      .post(`/api/v1/manage/instructors/${instructor.user.id}/performance/reset`)
      .set(bearer(instructor.accessToken))
      .send({})
      .expect(403);
    const reset = await api(app)
      .post(`/api/v1/manage/instructors/${instructor.user.id}/performance/reset`)
      .set(bearer(admin.accessToken))
      .send({ note: 'New period' })
      .expect(200);
    expect(reset.body.data.note).toBe('New period');

    const after = await api(app)
      .get(`/api/v1/manage/instructors/${instructor.user.id}/performance`)
      .set(bearer(admin.accessToken))
      .expect(200);
    expect(after.body.data).toMatchObject({ enrollments: 0, completions: 0, publishedCourses: 1 });
    expect(after.body.data.since).toEqual(expect.any(String));
  });
});

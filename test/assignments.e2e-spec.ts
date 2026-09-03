import { type NestExpressApplication } from '@nestjs/platform-express';
import { UserRole } from '../src/common/enums/user-role.enum';
import { MailService } from '../src/mail/mail.service';
import { api, bearer, createUserSession, type TestSession } from './utils/auth';
import { createTestApp, resetDatabase } from './utils/test-app';

interface IdHolder {
  id: string;
}

describe('Assignments (e2e)', () => {
  let app: NestExpressApplication;
  let instructor: TestSession;
  let learnerA: TestSession;
  let learnerB: TestSession;
  let courseId: string;
  let lessonId: string;
  let cohortId: string;
  let submissionA: string;
  let submissionB: string;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    instructor = await createUserSession(app, { role: UserRole.INSTRUCTOR });
    learnerA = await createUserSession(app, { firstName: 'Ann', lastName: 'A' });
    learnerB = await createUserSession(app, { firstName: 'Ben', lastName: 'B' });

    const course = await api(app)
      .post('/api/v1/manage/courses')
      .set(bearer(instructor.accessToken))
      .send({ title: 'Assignment Course', summary: 'Course with a graded assignment' })
      .expect(201);
    courseId = (course.body.data as IdHolder).id;
    const module = await api(app)
      .post(`/api/v1/manage/courses/${courseId}/modules`)
      .set(bearer(instructor.accessToken))
      .send({ title: 'Module' })
      .expect(201);
    const lesson = await api(app)
      .post(`/api/v1/manage/modules/${(module.body.data as IdHolder).id}/lessons`)
      .set(bearer(instructor.accessToken))
      .send({ title: 'Project', type: 'ASSIGNMENT' })
      .expect(201);
    lessonId = (lesson.body.data as IdHolder).id;
    await api(app)
      .post(`/api/v1/manage/courses/${courseId}/publish`)
      .set(bearer(instructor.accessToken))
      .expect(200);
    const cohort = await api(app)
      .post(`/api/v1/manage/courses/${courseId}/cohorts`)
      .set(bearer(instructor.accessToken))
      .send({
        title: 'Cohort',
        startsAt: '2030-01-01T00:00:00Z',
        endsAt: '2030-02-01T00:00:00Z',
        capacity: 10,
      })
      .expect(201);
    cohortId = (cohort.body.data as IdHolder).id;
    for (const learner of [learnerA, learnerB]) {
      await api(app)
        .post('/api/v1/enrollments')
        .set(bearer(learner.accessToken))
        .send({ courseId, cohortId })
        .expect(201);
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('lets instructors define an assignment with a rubric', async () => {
    await api(app)
      .put(`/api/v1/manage/lessons/${lessonId}/assignment`)
      .set(bearer(instructor.accessToken))
      .send({
        title: 'Build a CLI',
        instructions: 'Ship a small command line tool.',
        maxPoints: 100,
        rubric: [{ id: 'works', criterion: 'It works', maxPoints: 50 }],
      })
      .expect(400);

    const created = await api(app)
      .put(`/api/v1/manage/lessons/${lessonId}/assignment`)
      .set(bearer(instructor.accessToken))
      .send({
        title: 'Build a CLI',
        instructions: 'Ship a small command line tool.',
        submissionType: 'TEXT',
        maxPoints: 100,
        passingPoints: 60,
        rubric: [
          { id: 'works', criterion: 'It works', maxPoints: 60 },
          { id: 'clean', criterion: 'Readable code', maxPoints: 40 },
        ],
      })
      .expect(200);
    expect(created.body.data).toMatchObject({ title: 'Build a CLI', passingPoints: 60 });
    expect(created.body.data.rubric).toHaveLength(2);
  });

  it('accepts one submission at a time per learner', async () => {
    const view = await api(app)
      .get(`/api/v1/assignments/lessons/${lessonId}`)
      .set(bearer(learnerA.accessToken))
      .expect(200);
    expect(view.body.data).toMatchObject({ canSubmit: true, reason: null });

    await api(app)
      .post(`/api/v1/assignments/lessons/${lessonId}/submissions`)
      .set(bearer(learnerA.accessToken))
      .send({ fileKey: 'k', fileUrl: 'https://files.test/a.zip' })
      .expect(400);

    const submitted = await api(app)
      .post(`/api/v1/assignments/lessons/${lessonId}/submissions`)
      .set(bearer(learnerA.accessToken))
      .send({ text: 'Here is my CLI: https://github.com/ann/cli' })
      .expect(201);
    submissionA = (submitted.body.data as IdHolder).id;
    expect(submitted.body.data).toMatchObject({ status: 'SUBMITTED', attemptNumber: 1 });

    await api(app)
      .post(`/api/v1/assignments/lessons/${lessonId}/submissions`)
      .set(bearer(learnerA.accessToken))
      .send({ text: 'again' })
      .expect(409);

    const second = await api(app)
      .post(`/api/v1/assignments/lessons/${lessonId}/submissions`)
      .set(bearer(learnerB.accessToken))
      .send({ text: 'My attempt' })
      .expect(201);
    submissionB = (second.body.data as IdHolder).id;

    const inbox = await api(app)
      .get('/api/v1/notifications?unreadOnly=true')
      .set(bearer(instructor.accessToken))
      .expect(200);
    expect(inbox.body.data).toHaveLength(2);
    expect(inbox.body.data[0].type).toBe('SUBMISSION_RECEIVED');
  });

  it('grades with the rubric, completes the lesson on a pass and notifies the learner', async () => {
    const list = await api(app)
      .get(`/api/v1/manage/lessons/${lessonId}/submissions?status=SUBMITTED`)
      .set(bearer(instructor.accessToken))
      .expect(200);
    expect(list.body.meta.total).toBe(2);
    expect(list.body.data[0].learner.email).toBeDefined();

    await api(app)
      .post(`/api/v1/manage/submissions/${submissionA}/grade`)
      .set(bearer(learnerA.accessToken))
      .send({ score: 100 })
      .expect(403);

    const graded = await api(app)
      .post(`/api/v1/manage/submissions/${submissionA}/grade`)
      .set(bearer(instructor.accessToken))
      .send({
        rubricScores: [
          { criterionId: 'works', points: 55, comment: 'Solid' },
          { criterionId: 'clean', points: 30 },
        ],
        feedback: 'Great job',
      })
      .expect(200);
    expect(graded.body.data).toMatchObject({ score: 85, status: 'GRADED', feedback: 'Great job' });

    const progress = await api(app)
      .get(`/api/v1/enrollments/courses/${courseId}/progress`)
      .set(bearer(learnerA.accessToken))
      .expect(200);
    expect(progress.body.data.enrollment).toMatchObject({
      progressPercent: 100,
      status: 'COMPLETED',
    });

    const inbox = await api(app)
      .get('/api/v1/notifications')
      .set(bearer(learnerA.accessToken))
      .expect(200);
    expect(inbox.body.data[0]).toMatchObject({ type: 'GRADE_POSTED', data: { passed: true } });
    expect((inbox.body.data as { type: string }[]).map((n) => n.type)).toContain(
      'CERTIFICATE_ISSUED',
    );
    const mail = [...app.get(MailService).outbox]
      .reverse()
      .find((m) => m.to === learnerA.user.email);
    expect(mail?.subject).toContain('Build a CLI');

    const unread = await api(app)
      .get('/api/v1/notifications/unread-count')
      .set(bearer(learnerA.accessToken))
      .expect(200);
    expect(unread.body.data.unread).toBe(2);
    await api(app)
      .post('/api/v1/notifications/read-all')
      .set(bearer(learnerA.accessToken))
      .expect(200);
  });

  it('returns failing work so the learner can resubmit', async () => {
    const graded = await api(app)
      .post(`/api/v1/manage/submissions/${submissionB}/grade`)
      .set(bearer(instructor.accessToken))
      .send({
        rubricScores: [
          { criterionId: 'works', points: 20 },
          { criterionId: 'clean', points: 10 },
        ],
        feedback: 'It crashes on start',
      })
      .expect(200);
    expect(graded.body.data).toMatchObject({ score: 30, status: 'RETURNED' });

    const view = await api(app)
      .get(`/api/v1/assignments/lessons/${lessonId}`)
      .set(bearer(learnerB.accessToken))
      .expect(200);
    expect(view.body.data.canSubmit).toBe(true);
    expect(view.body.data.submissions[0].feedback).toBe('It crashes on start');

    const again = await api(app)
      .post(`/api/v1/assignments/lessons/${lessonId}/submissions`)
      .set(bearer(learnerB.accessToken))
      .send({ text: 'Fixed the crash' })
      .expect(201);
    expect(again.body.data.attemptNumber).toBe(2);
  });

  it('builds the cohort gradebook', async () => {
    const gradebook = await api(app)
      .get(`/api/v1/manage/cohorts/${cohortId}/gradebook`)
      .set(bearer(instructor.accessToken))
      .expect(200);

    expect(gradebook.body.data.columns).toHaveLength(1);
    expect(gradebook.body.data.columns[0]).toMatchObject({
      kind: 'assignment',
      title: 'Build a CLI',
    });
    const rows = gradebook.body.data.rows as {
      learner: { id: string };
      cells: { status: string; score: number | null }[];
      averagePercent: number | null;
    }[];
    const byLearner = Object.fromEntries(rows.map((row) => [row.learner.id, row]));
    expect(byLearner[learnerA.user.id].cells[0]).toMatchObject({ status: 'PASSED', score: 85 });
    expect(byLearner[learnerA.user.id].averagePercent).toBe(85);
    expect(byLearner[learnerB.user.id].cells[0].status).toBe('SUBMITTED');

    await api(app)
      .get(`/api/v1/manage/cohorts/${cohortId}/gradebook`)
      .set(bearer(learnerA.accessToken))
      .expect(403);
  });
});

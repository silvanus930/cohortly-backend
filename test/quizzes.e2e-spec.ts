import { type NestExpressApplication } from '@nestjs/platform-express';
import { UserRole } from '../src/common/enums/user-role.enum';
import { api, bearer, createUserSession, type TestSession } from './utils/auth';
import { createTestApp, resetDatabase } from './utils/test-app';

interface IdHolder {
  id: string;
}

const quizPayload = {
  title: 'Checkpoint',
  passingScore: 60,
  maxAttempts: 2,
  questions: [
    {
      id: 'q1',
      prompt: 'Which keyword declares a constant?',
      type: 'SINGLE',
      options: [
        { id: 'a', text: 'let' },
        { id: 'b', text: 'const' },
      ],
      correctOptionIds: ['b'],
      points: 2,
      explanation: 'const cannot be reassigned.',
    },
    {
      id: 'q2',
      prompt: 'TypeScript compiles to JavaScript',
      type: 'TRUE_FALSE',
      options: [
        { id: 't', text: 'True' },
        { id: 'f', text: 'False' },
      ],
      correctOptionIds: ['t'],
    },
  ],
};

describe('Quizzes (e2e)', () => {
  let app: NestExpressApplication;
  let instructor: TestSession;
  let learner: TestSession;
  let courseId: string;
  let readingLessonId: string;
  let quizLessonId: string;
  let afterQuizLessonId: string;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    instructor = await createUserSession(app, { role: UserRole.INSTRUCTOR });
    learner = await createUserSession(app);

    const course = await api(app)
      .post('/api/v1/manage/courses')
      .set(bearer(instructor.accessToken))
      .send({ title: 'Quiz Course', summary: 'Course with a gated quiz' })
      .expect(201);
    courseId = (course.body.data as IdHolder).id;
    const module = await api(app)
      .post(`/api/v1/manage/courses/${courseId}/modules`)
      .set(bearer(instructor.accessToken))
      .send({ title: 'Module' })
      .expect(201);
    const moduleId = (module.body.data as IdHolder).id;
    const addLesson = async (title: string, type: string): Promise<string> => {
      const lesson = await api(app)
        .post(`/api/v1/manage/modules/${moduleId}/lessons`)
        .set(bearer(instructor.accessToken))
        .send({ title, type, body: 'text' })
        .expect(201);
      return (lesson.body.data as IdHolder).id;
    };
    readingLessonId = await addLesson('Reading', 'READING');
    quizLessonId = await addLesson('Quiz', 'QUIZ');
    afterQuizLessonId = await addLesson('After quiz', 'READING');
    await api(app)
      .post(`/api/v1/manage/courses/${courseId}/publish`)
      .set(bearer(instructor.accessToken))
      .expect(200);
    await api(app)
      .post('/api/v1/enrollments')
      .set(bearer(learner.accessToken))
      .send({ courseId })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it('lets instructors author a quiz on a QUIZ lesson only', async () => {
    await api(app)
      .put(`/api/v1/manage/lessons/${readingLessonId}/quiz`)
      .set(bearer(instructor.accessToken))
      .send(quizPayload)
      .expect(400);

    const created = await api(app)
      .put(`/api/v1/manage/lessons/${quizLessonId}/quiz`)
      .set(bearer(instructor.accessToken))
      .send(quizPayload)
      .expect(200);
    expect(created.body.data).toMatchObject({ title: 'Checkpoint', totalPoints: 3 });

    await api(app)
      .put(`/api/v1/manage/lessons/${quizLessonId}/quiz`)
      .set(bearer(instructor.accessToken))
      .send({
        ...quizPayload,
        questions: [{ ...quizPayload.questions[0], correctOptionIds: ['zz'] }],
      })
      .expect(400);
  });

  it('shows learners the quiz without answers', async () => {
    const view = await api(app)
      .get(`/api/v1/quizzes/lessons/${quizLessonId}`)
      .set(bearer(learner.accessToken))
      .expect(200);

    expect(view.body.data.questions[0]).not.toHaveProperty('correctOptionIds');
    expect(view.body.data).toMatchObject({ attemptsUsed: 0, attemptsLeft: 2, passed: false });
  });

  it('gates the following lesson until the quiz is passed', async () => {
    await api(app)
      .put(`/api/v1/enrollments/lessons/${readingLessonId}/progress`)
      .set(bearer(learner.accessToken))
      .send({ status: 'COMPLETED' })
      .expect(200);

    await api(app)
      .put(`/api/v1/enrollments/lessons/${quizLessonId}/progress`)
      .set(bearer(learner.accessToken))
      .send({ status: 'COMPLETED' })
      .expect(403);
    await api(app)
      .put(`/api/v1/enrollments/lessons/${afterQuizLessonId}/progress`)
      .set(bearer(learner.accessToken))
      .send({ status: 'COMPLETED' })
      .expect(403);
  });

  it('grades attempts, enforces the attempt limit and unlocks progress on a pass', async () => {
    const failed = await api(app)
      .post(`/api/v1/quizzes/lessons/${quizLessonId}/attempts`)
      .set(bearer(learner.accessToken))
      .send({ answers: [{ questionId: 'q1', selectedOptionIds: ['a'] }] })
      .expect(201);
    expect(failed.body.data).toMatchObject({ scorePercent: 0, passed: false, attemptNumber: 1 });
    expect(failed.body.data.results[0]).toMatchObject({
      correct: false,
      correctOptionIds: ['b'],
      explanation: 'const cannot be reassigned.',
    });

    const passed = await api(app)
      .post(`/api/v1/quizzes/lessons/${quizLessonId}/attempts`)
      .set(bearer(learner.accessToken))
      .send({
        answers: [
          { questionId: 'q1', selectedOptionIds: ['b'] },
          { questionId: 'q2', selectedOptionIds: ['t'] },
        ],
      })
      .expect(201);
    expect(passed.body.data).toMatchObject({ scorePercent: 100, passed: true, attemptNumber: 2 });

    await api(app)
      .post(`/api/v1/quizzes/lessons/${quizLessonId}/attempts`)
      .set(bearer(learner.accessToken))
      .send({ answers: [] })
      .expect(403);

    const progress = await api(app)
      .get(`/api/v1/enrollments/courses/${courseId}/progress`)
      .set(bearer(learner.accessToken))
      .expect(200);
    const lessons = progress.body.data.modules[0].lessons as { id: string; status: string }[];
    expect(lessons.find((l) => l.id === quizLessonId)?.status).toBe('COMPLETED');
    expect(progress.body.data.nextLesson.id).toBe(afterQuizLessonId);

    const finished = await api(app)
      .put(`/api/v1/enrollments/lessons/${afterQuizLessonId}/progress`)
      .set(bearer(learner.accessToken))
      .send({ status: 'COMPLETED' })
      .expect(200);
    expect(finished.body.data.enrollment).toMatchObject({
      progressPercent: 100,
      status: 'COMPLETED',
    });

    const attempts = await api(app)
      .get(`/api/v1/quizzes/lessons/${quizLessonId}/attempts`)
      .set(bearer(learner.accessToken))
      .expect(200);
    expect(attempts.body.data).toHaveLength(2);
  });
});

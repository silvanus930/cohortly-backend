import { type NestExpressApplication } from '@nestjs/platform-express';
import { UserRole } from '../src/common/enums/user-role.enum';
import { api, bearer, createUserSession, type TestSession } from './utils/auth';
import { createTestApp, resetDatabase } from './utils/test-app';

interface IdHolder {
  id: string;
}

describe('Courses (e2e)', () => {
  let app: NestExpressApplication;
  let admin: TestSession;
  let instructor: TestSession;
  let otherInstructor: TestSession;
  let learner: TestSession;
  let categoryId: string;
  let courseId: string;
  let courseSlug: string;
  let moduleId: string;
  let lessonId: string;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    admin = await createUserSession(app, { role: UserRole.ADMIN });
    instructor = await createUserSession(app, { role: UserRole.INSTRUCTOR, firstName: 'Ivo' });
    otherInstructor = await createUserSession(app, { role: UserRole.INSTRUCTOR });
    learner = await createUserSession(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('categories', () => {
    it('lets admins create categories that anyone can list', async () => {
      await api(app)
        .post('/api/v1/categories')
        .set(bearer(instructor.accessToken))
        .send({ name: 'Web Development' })
        .expect(403);

      const created = await api(app)
        .post('/api/v1/categories')
        .set(bearer(admin.accessToken))
        .send({ name: 'Web Development', description: 'Frontend and backend' })
        .expect(201);
      categoryId = (created.body.data as IdHolder).id;
      expect(created.body.data.slug).toBe('web-development');

      const listed = await api(app).get('/api/v1/categories').expect(200);
      expect(listed.body.data).toHaveLength(1);
    });
  });

  describe('authoring', () => {
    it('creates a draft course owned by the instructor', async () => {
      const response = await api(app)
        .post('/api/v1/manage/courses')
        .set(bearer(instructor.accessToken))
        .send({
          title: 'Full Stack TypeScript',
          summary: 'Ship a production app with NestJS and React',
          categoryId,
          tags: ['TypeScript', 'nestjs'],
          pricing: 'PAID',
          priceCents: 19900,
        })
        .expect(201);

      courseId = (response.body.data as IdHolder).id;
      courseSlug = response.body.data.slug as string;
      expect(response.body.data).toMatchObject({
        status: 'DRAFT',
        slug: 'full-stack-typescript',
        tags: ['typescript', 'nestjs'],
        category: { id: categoryId },
        instructor: { id: instructor.user.id },
      });
    });

    it('rejects paid courses without a price and learners entirely', async () => {
      await api(app)
        .post('/api/v1/manage/courses')
        .set(bearer(instructor.accessToken))
        .send({ title: 'Broken', summary: 'No price given here', pricing: 'PAID' })
        .expect(400);
      await api(app)
        .post('/api/v1/manage/courses')
        .set(bearer(learner.accessToken))
        .send({ title: 'Nope', summary: 'Learners cannot author' })
        .expect(403);
    });

    it('keeps other instructors out of the course', async () => {
      await api(app)
        .get(`/api/v1/manage/courses/${courseId}`)
        .set(bearer(otherInstructor.accessToken))
        .expect(403);
      await api(app)
        .patch(`/api/v1/manage/courses/${courseId}`)
        .set(bearer(otherInstructor.accessToken))
        .send({ title: 'Hijacked' })
        .expect(403);
      await api(app)
        .get(`/api/v1/manage/courses/${courseId}`)
        .set(bearer(admin.accessToken))
        .expect(200);
    });

    it('refuses to publish before a lesson exists', async () => {
      await api(app)
        .post(`/api/v1/manage/courses/${courseId}/publish`)
        .set(bearer(instructor.accessToken))
        .expect(400);
    });

    it('builds the curriculum and rolls up the duration', async () => {
      const module = await api(app)
        .post(`/api/v1/manage/courses/${courseId}/modules`)
        .set(bearer(instructor.accessToken))
        .send({ title: 'Getting started' })
        .expect(201);
      moduleId = (module.body.data as IdHolder).id;

      const lesson = await api(app)
        .post(`/api/v1/manage/modules/${moduleId}/lessons`)
        .set(bearer(instructor.accessToken))
        .send({ title: 'Welcome', type: 'VIDEO', durationMinutes: 12, isPreview: true })
        .expect(201);
      lessonId = (lesson.body.data as IdHolder).id;

      await api(app)
        .post(`/api/v1/manage/modules/${moduleId}/lessons`)
        .set(bearer(instructor.accessToken))
        .send({ title: 'Reading', type: 'READING', durationMinutes: 8, body: 'Secret text' })
        .expect(201);

      const detail = await api(app)
        .get(`/api/v1/manage/courses/${courseId}`)
        .set(bearer(instructor.accessToken))
        .expect(200);
      expect(detail.body.data.durationMinutes).toBe(20);
      const titles = (detail.body.data.modules[0].lessons as { title: string }[]).map(
        (l) => l.title,
      );
      expect(titles).toEqual(['Welcome', 'Reading']);
    });

    it('reorders lessons and validates the id list', async () => {
      const detail = await api(app)
        .get(`/api/v1/manage/courses/${courseId}`)
        .set(bearer(instructor.accessToken));
      const ids = (detail.body.data.modules[0].lessons as IdHolder[]).map((l) => l.id);

      await api(app)
        .put(`/api/v1/manage/modules/${moduleId}/lessons/reorder`)
        .set(bearer(instructor.accessToken))
        .send({ ids: [ids[0]] })
        .expect(400);

      const reordered = await api(app)
        .put(`/api/v1/manage/modules/${moduleId}/lessons/reorder`)
        .set(bearer(instructor.accessToken))
        .send({ ids: [ids[1], ids[0]] })
        .expect(200);
      expect((reordered.body.data as IdHolder[]).map((l) => l.id)).toEqual([ids[1], ids[0]]);

      await api(app)
        .put(`/api/v1/manage/modules/${moduleId}/lessons/reorder`)
        .set(bearer(instructor.accessToken))
        .send({ ids })
        .expect(200);
    });

    it('adds faqs and reports storage as unavailable for uploads in this environment', async () => {
      await api(app)
        .post(`/api/v1/manage/courses/${courseId}/faqs`)
        .set(bearer(instructor.accessToken))
        .send({ question: 'Is there a certificate?', answer: 'Yes, on completion.' })
        .expect(201);

      await api(app)
        .post(`/api/v1/manage/courses/${courseId}/cover`)
        .set(bearer(instructor.accessToken))
        .send({ fileName: 'cover.png', mimeType: 'image/png', sizeBytes: 1024 })
        .expect(503);

      await api(app)
        .post(`/api/v1/manage/lessons/${lessonId}/materials`)
        .set(bearer(instructor.accessToken))
        .send({
          title: 'Virus',
          fileName: 'x.exe',
          mimeType: 'application/x-msdownload',
          sizeBytes: 5,
        })
        .expect(400);
    });

    it('publishes once a lesson exists', async () => {
      const response = await api(app)
        .post(`/api/v1/manage/courses/${courseId}/publish`)
        .set(bearer(instructor.accessToken))
        .expect(200);

      expect(response.body.data.status).toBe('PUBLISHED');
      expect(response.body.data.publishedAt).toEqual(expect.any(String));
    });
  });

  describe('catalog', () => {
    it('lists only published courses with search and filters', async () => {
      await api(app)
        .post('/api/v1/manage/courses')
        .set(bearer(instructor.accessToken))
        .send({ title: 'Hidden draft', summary: 'Should not appear in the catalog' })
        .expect(201);

      const all = await api(app).get('/api/v1/catalog/courses').expect(200);
      expect(all.body.data).toHaveLength(1);
      expect(all.body.meta.total).toBe(1);

      const byTag = await api(app).get('/api/v1/catalog/courses?tag=nestjs').expect(200);
      expect(byTag.body.data).toHaveLength(1);

      const miss = await api(app).get('/api/v1/catalog/courses?search=cobol').expect(200);
      expect(miss.body.data).toHaveLength(0);

      const byCategory = await api(app)
        .get('/api/v1/catalog/courses?category=web-development&pricing=PAID')
        .expect(200);
      expect(byCategory.body.data[0].slug).toBe(courseSlug);
    });

    it('hides non preview lesson content from anonymous and learner viewers', async () => {
      const anonymous = await api(app).get(`/api/v1/catalog/courses/${courseSlug}`).expect(200);
      const lessons = anonymous.body.data.modules[0].lessons as {
        title: string;
        body: string | null;
      }[];
      expect(lessons.find((l) => l.title === 'Reading')?.body).toBeNull();
      expect(anonymous.body.data.faqs).toHaveLength(1);

      const asLearner = await api(app)
        .get(`/api/v1/catalog/courses/${courseSlug}`)
        .set(bearer(learner.accessToken))
        .expect(200);
      expect(asLearner.body.data.modules[0].lessons[1].body).toBeNull();

      const asOwner = await api(app)
        .get(`/api/v1/catalog/courses/${courseSlug}`)
        .set(bearer(instructor.accessToken))
        .expect(200);
      const ownerLessons = asOwner.body.data.modules[0].lessons as {
        title: string;
        body: string | null;
      }[];
      expect(ownerLessons.find((l) => l.title === 'Reading')?.body).toBe('Secret text');
    });

    it('returns 404 for drafts and unknown slugs', async () => {
      await api(app).get('/api/v1/catalog/courses/hidden-draft').expect(404);
      await api(app).get('/api/v1/catalog/courses/does-not-exist').expect(404);
    });

    it('recommends published courses', async () => {
      const response = await api(app).get('/api/v1/catalog/recommendations?limit=3').expect(200);

      expect((response.body.data as { slug: string }[]).map((c) => c.slug)).toEqual([courseSlug]);
    });
  });
});

import { type INestApplication } from '@nestjs/common';
import { api, bearer, type TestSession } from './auth';

interface IdHolder {
  id: string;
}

export interface PublishedCourse {
  courseId: string;
  slug: string;
  moduleId: string;
  lessonIds: string[];
}

/** Creates a course with one module and the given lessons, then publishes it. */
export async function publishCourse(
  app: INestApplication,
  instructor: TestSession,
  title: string,
  options: { lessons?: number; pricing?: 'FREE' | 'PAID'; priceCents?: number } = {},
): Promise<PublishedCourse> {
  const course = await api(app)
    .post('/api/v1/manage/courses')
    .set(bearer(instructor.accessToken))
    .send({
      title,
      summary: 'A published course used by the e2e suites',
      pricing: options.pricing ?? 'FREE',
      priceCents: options.priceCents,
    })
    .expect(201);
  const courseId = (course.body.data as IdHolder).id;
  const slug = course.body.data.slug as string;
  const module = await api(app)
    .post(`/api/v1/manage/courses/${courseId}/modules`)
    .set(bearer(instructor.accessToken))
    .send({ title: 'Module' })
    .expect(201);
  const moduleId = (module.body.data as IdHolder).id;
  const lessonIds: string[] = [];
  for (let index = 0; index < (options.lessons ?? 1); index += 1) {
    const lesson = await api(app)
      .post(`/api/v1/manage/modules/${moduleId}/lessons`)
      .set(bearer(instructor.accessToken))
      .send({ title: `Lesson ${index + 1}`, type: 'READING', body: 'Hello', durationMinutes: 5 })
      .expect(201);
    lessonIds.push((lesson.body.data as IdHolder).id);
  }
  await api(app)
    .post(`/api/v1/manage/courses/${courseId}/publish`)
    .set(bearer(instructor.accessToken))
    .expect(200);
  return { courseId, slug, moduleId, lessonIds };
}

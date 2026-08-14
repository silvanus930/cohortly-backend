import { type NestExpressApplication } from '@nestjs/platform-express';
import { UserRole } from '../src/common/enums/user-role.enum';
import { MailService } from '../src/mail/mail.service';
import { api, bearer, createUserSession, type TestSession } from './utils/auth';
import { publishCourse, type PublishedCourse } from './utils/courses';
import { createTestApp, resetDatabase } from './utils/test-app';

describe('Certificates (e2e)', () => {
  let app: NestExpressApplication;
  let admin: TestSession;
  let instructor: TestSession;
  let learner: TestSession;
  let course: PublishedCourse;
  let code: string;
  let certificateId: string;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    admin = await createUserSession(app, { role: UserRole.ADMIN });
    instructor = await createUserSession(app, {
      role: UserRole.INSTRUCTOR,
      firstName: 'Ivo',
      lastName: 'Teach',
    });
    learner = await createUserSession(app, { firstName: 'Ada', lastName: 'Lovelace' });
    course = await publishCourse(app, instructor, 'Certified Course', { lessons: 1 });
    await api(app)
      .post('/api/v1/enrollments')
      .set(bearer(learner.accessToken))
      .send({ courseId: course.courseId })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it('issues a certificate automatically when the course is completed', async () => {
    const done = await api(app)
      .put(`/api/v1/enrollments/lessons/${course.lessonIds[0]}/progress`)
      .set(bearer(learner.accessToken))
      .send({ status: 'COMPLETED' })
      .expect(200);
    expect(done.body.data.enrollment.status).toBe('COMPLETED');

    const mine = await api(app)
      .get('/api/v1/certificates/mine')
      .set(bearer(learner.accessToken))
      .expect(200);
    expect(mine.body.data).toHaveLength(1);
    code = mine.body.data[0].code as string;
    certificateId = mine.body.data[0].id as string;
    expect(mine.body.data[0]).toMatchObject({
      recipientName: 'Ada Lovelace',
      courseTitle: 'Certified Course',
      instructorName: 'Ivo Teach',
      course: { slug: course.slug },
      verifyUrl: expect.stringContaining(code) as string,
    });

    const inbox = await api(app)
      .get('/api/v1/notifications')
      .set(bearer(learner.accessToken))
      .expect(200);
    expect(inbox.body.data[0].type).toBe('CERTIFICATE_ISSUED');
    const mail = [...app.get(MailService).outbox]
      .reverse()
      .find((m) => m.to === learner.user.email);
    expect(mail?.subject).toContain('certificate');
  });

  it('verifies the code publicly and serves the svg', async () => {
    const verified = await api(app)
      .get(`/api/v1/certificates/verify/${code.toLowerCase()}`)
      .expect(200);
    expect(verified.body.data).toMatchObject({ valid: true, recipientName: 'Ada Lovelace' });

    const svg = await api(app)
      .get(`/api/v1/certificates/svg/${code}`)
      .buffer(true)
      .parse((response, callback) => {
        let data = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          data += chunk;
        });
        response.on('end', () => callback(null, data));
      })
      .expect(200);
    expect(svg.headers['content-type']).toContain('image/svg+xml');
    const document = svg.body as string;
    expect(document).toContain('<svg');
    expect(document).toContain('Ada Lovelace');
    expect(document).toContain(code);

    await api(app).get('/api/v1/certificates/verify/CHT-ZZZZ-ZZZZ').expect(404);
  });

  it('lets admins reissue and revoke certificates', async () => {
    await api(app)
      .post(`/api/v1/manage/certificates/${certificateId}/reissue`)
      .set(bearer(learner.accessToken))
      .expect(403);

    const reissued = await api(app)
      .post(`/api/v1/manage/certificates/${certificateId}/reissue`)
      .set(bearer(admin.accessToken))
      .expect(200);
    expect(reissued.body.data.code).toBe(code);

    const listed = await api(app)
      .get(`/api/v1/manage/certificates?courseId=${course.courseId}`)
      .set(bearer(admin.accessToken))
      .expect(200);
    expect(listed.body.data[0].learner.email).toBe(learner.user.email);

    await api(app)
      .post(`/api/v1/manage/certificates/${certificateId}/revoke`)
      .set(bearer(admin.accessToken))
      .send({ reason: 'Academic integrity review' })
      .expect(200);

    const verified = await api(app).get(`/api/v1/certificates/verify/${code}`).expect(200);
    expect(verified.body.data.valid).toBe(false);
    await api(app).get(`/api/v1/certificates/svg/${code}`).expect(410);
  });
});

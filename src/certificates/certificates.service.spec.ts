import { BadRequestException, GoneException, Logger, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserRole } from '../common/enums/user-role.enum';
import { appConfig } from '../config/configuration';
import { CoursesService } from '../courses/courses.service';
import { type Enrollment } from '../enrollments/entities/enrollment.entity';
import { MailService } from '../mail/mail.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { StorageService } from '../storage/storage.service';
import { type User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { CertificatesService } from './certificates.service';
import { Certificate } from './entities/certificate.entity';

const learner = {
  id: 'lea',
  role: UserRole.LEARNER,
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@x.test',
} as User;
const enrollment = {
  id: 'e1',
  courseId: 'c1',
  completedAt: new Date('2026-03-15T00:00:00Z'),
} as Enrollment;
const course = {
  id: 'c1',
  title: 'TypeScript',
  slug: 'typescript',
  instructor: { firstName: 'Ivo', lastName: 'Teach' },
};

describe('CertificatesService', () => {
  let service: CertificatesService;
  const certificates = {
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    exists: jest.fn().mockResolvedValue(false),
    create: jest.fn((value: object) => value),
    save: jest.fn((value: object) => Promise.resolve({ id: 'cert-1', ...value })),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
  };
  const coursesService = { findByIdOrFail: jest.fn().mockResolvedValue(course) };
  const usersService = { findByIdOrFail: jest.fn().mockResolvedValue(learner) };
  const storageService = { putObject: jest.fn().mockResolvedValue(null) };
  const mailService = { sendCertificateIssued: jest.fn().mockResolvedValue(undefined) };
  const notificationsService = { notify: jest.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    jest.clearAllMocks();
    certificates.findOne.mockResolvedValue(null);
    certificates.exists.mockResolvedValue(false);
    storageService.putObject.mockResolvedValue(null);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const moduleRef = await Test.createTestingModule({
      providers: [
        CertificatesService,
        { provide: getRepositoryToken(Certificate), useValue: certificates },
        { provide: CoursesService, useValue: coursesService },
        { provide: UsersService, useValue: usersService },
        { provide: StorageService, useValue: storageService },
        { provide: MailService, useValue: mailService },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: appConfig.KEY, useValue: { name: 'Cohortly', url: 'https://app.test' } },
      ],
    }).compile();
    service = moduleRef.get(CertificatesService);
  });

  it('issues a rendered certificate once per enrollment and notifies the learner', async () => {
    const issued = await service.issueForEnrollment(enrollment, learner);

    expect(issued).toMatchObject({
      enrollmentId: 'e1',
      recipientName: 'Ada Lovelace',
      courseTitle: 'TypeScript',
      instructorName: 'Ivo Teach',
      fileUrl: null,
      templateVersion: 1,
    });
    expect(issued.code).toMatch(/^CHT-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(issued.svg).toContain('Ada Lovelace');
    expect(issued.svg).toContain(issued.code);
    expect(notificationsService.notify).toHaveBeenCalledWith(
      'lea',
      expect.objectContaining({ type: NotificationType.CERTIFICATE_ISSUED }),
    );
    expect(mailService.sendCertificateIssued).toHaveBeenCalledWith(
      learner,
      'TypeScript',
      `https://app.test/certificates/verify/${issued.code}`,
    );

    certificates.findOne.mockResolvedValue(issued);
    await expect(service.issueForEnrollment(enrollment, learner)).resolves.toBe(issued);
    expect(certificates.save).toHaveBeenCalledTimes(1);
  });

  it('stores the uploaded file url when storage is configured', async () => {
    storageService.putObject.mockResolvedValue('https://cdn/certificates/x.svg');

    const issued = await service.issueForEnrollment(enrollment, learner);

    expect(storageService.putObject).toHaveBeenCalledWith(
      `certificates/${issued.code}.svg`,
      expect.stringContaining('<svg'),
      'image/svg+xml',
    );
    expect(issued.fileUrl).toBe('https://cdn/certificates/x.svg');
    expect(issued.fileKey).toBe(`certificates/${issued.code}.svg`);
  });

  it('keeps issuing when the upload fails', async () => {
    storageService.putObject.mockRejectedValue(new Error('offline'));

    const issued = await service.issueForEnrollment(enrollment, learner);

    expect(issued.fileUrl).toBeNull();
    expect(issued.svg).toContain('<svg');
  });

  it('retries code generation on collisions', async () => {
    certificates.exists.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await service.issueForEnrollment(enrollment, learner);

    expect(certificates.exists).toHaveBeenCalledTimes(2);
  });

  it('verifies codes case insensitively and reports revocations', async () => {
    certificates.findOne.mockResolvedValue({
      code: 'CHT-AB23-CD45',
      recipientName: 'Ada Lovelace',
      courseTitle: 'TypeScript',
      course,
      completedAt: enrollment.completedAt,
      issuedAt: new Date(),
      revokedAt: null,
      fileUrl: null,
      svg: '<svg/>',
    });

    const verification = await service.verify(' cht-ab23-cd45 ');
    expect(verification).toMatchObject({ valid: true, course: { slug: 'typescript' } });
    expect(certificates.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { code: 'CHT-AB23-CD45' } }),
    );
    await expect(service.svgByCode('CHT-AB23-CD45')).resolves.toBe('<svg/>');

    certificates.findOne.mockResolvedValue(null);
    await expect(service.verify('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('revokes once and refuses to serve revoked svgs', async () => {
    certificates.findOne.mockResolvedValue({
      id: 'cert-1',
      code: 'X',
      revokedAt: null,
      svg: '<svg/>',
    });
    const revoked = await service.revoke('cert-1', ' Wrong learner ');
    expect(revoked).toMatchObject({ revokeReason: 'Wrong learner' });
    expect(revoked.revokedAt).toBeInstanceOf(Date);

    certificates.findOne.mockResolvedValue({
      id: 'cert-1',
      code: 'X',
      revokedAt: new Date(),
      svg: '<svg/>',
    });
    await expect(service.revoke('cert-1', 'again')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.svgByCode('X')).rejects.toBeInstanceOf(GoneException);
  });

  it('reissues with the current template and counts batches', async () => {
    const stored = {
      id: 'cert-1',
      code: 'CHT-AB23-CD45',
      userId: 'lea',
      recipientName: 'Old Name',
      courseTitle: 'TypeScript',
      instructorName: 'Ivo Teach',
      completedAt: enrollment.completedAt,
      templateVersion: 0,
      svg: 'stale',
    };
    certificates.findOne.mockResolvedValue(stored);
    certificates.find.mockResolvedValueOnce([stored]).mockResolvedValueOnce([]);

    const result = await service.reissueAll('c1');

    expect(result).toEqual({ reissued: 1, failed: 0 });
    expect(certificates.save).toHaveBeenCalledWith(
      expect.objectContaining({ recipientName: 'Ada Lovelace', templateVersion: 1 }),
    );
    expect((certificates.save.mock.calls[0][0] as { svg: string }).svg).toContain('Ada Lovelace');
  });
});

import { BadRequestException, ConflictException, ForbiddenException, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CohortsService } from '../cohorts/cohorts.service';
import { PaymentRequiredException } from '../common/exceptions/payment-required.exception';
import { UserRole } from '../common/enums/user-role.enum';
import { CoursesService } from '../courses/courses.service';
import { Course } from '../courses/entities/course.entity';
import { Lesson } from '../courses/entities/lesson.entity';
import { CoursePricing, CourseStatus } from '../courses/enums/course.enums';
import { OrganizationsService } from '../organizations/organizations.service';
import { type User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { EnrollmentsService } from './enrollments.service';
import { Enrollment } from './entities/enrollment.entity';
import { EnrollmentSource, EnrollmentStatus } from './enums/enrollment.enums';

const learner = { id: 'lea', role: UserRole.LEARNER } as User;
const freeCourse = { id: 'c1', status: CourseStatus.PUBLISHED, pricing: CoursePricing.FREE };
const paidCourse = { id: 'c2', status: CourseStatus.PUBLISHED, pricing: CoursePricing.PAID };

describe('EnrollmentsService', () => {
  let service: EnrollmentsService;
  const enrollments = {
    findOne: jest.fn(),
    exists: jest.fn(),
    create: jest.fn((value: object) => value),
    save: jest.fn((value: object) => Promise.resolve({ id: 'e1', ...value })),
    createQueryBuilder: jest.fn(),
  };
  const lessons = { count: jest.fn().mockResolvedValue(3) };
  const courses = { increment: jest.fn(), decrement: jest.fn() };
  const coursesService = { findByIdOrFail: jest.fn(), assertCanManage: jest.fn() };
  const cohortsService = { findByIdOrFail: jest.fn(), join: jest.fn(), leave: jest.fn() };
  const organizationsService = { findActiveSeat: jest.fn() };
  const usersService = { findByIdOrFail: jest.fn().mockResolvedValue(learner) };

  beforeEach(async () => {
    jest.clearAllMocks();
    enrollments.findOne.mockResolvedValue(null);
    lessons.count.mockResolvedValue(3);
    const moduleRef = await Test.createTestingModule({
      providers: [
        EnrollmentsService,
        { provide: getRepositoryToken(Enrollment), useValue: enrollments },
        { provide: getRepositoryToken(Lesson), useValue: lessons },
        { provide: getRepositoryToken(Course), useValue: courses },
        { provide: CoursesService, useValue: coursesService },
        { provide: CohortsService, useValue: cohortsService },
        { provide: OrganizationsService, useValue: organizationsService },
        { provide: UsersService, useValue: usersService },
      ],
    }).compile();
    service = moduleRef.get(EnrollmentsService);
  });

  it('enrolls in free published courses and bumps the course counter', async () => {
    coursesService.findByIdOrFail.mockResolvedValue(freeCourse);
    enrollments.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'e1', courseId: 'c1', source: EnrollmentSource.FREE });

    const enrollment = await service.enroll(learner, { courseId: 'c1' });

    expect(enrollments.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'lea',
        courseId: 'c1',
        source: EnrollmentSource.FREE,
        status: EnrollmentStatus.ACTIVE,
        totalLessons: 3,
      }),
    );
    expect(courses.increment).toHaveBeenCalledWith({ id: 'c1' }, 'enrollmentCount', 1);
    expect(enrollment.id).toBe('e1');
  });

  it('rejects unpublished courses and duplicate enrollments', async () => {
    coursesService.findByIdOrFail.mockResolvedValueOnce({
      ...freeCourse,
      status: CourseStatus.DRAFT,
    });
    await expect(service.enroll(learner, { courseId: 'c1' })).rejects.toBeInstanceOf(
      BadRequestException,
    );

    coursesService.findByIdOrFail.mockResolvedValueOnce(freeCourse);
    enrollments.findOne.mockResolvedValueOnce({ status: EnrollmentStatus.ACTIVE });
    await expect(service.enroll(learner, { courseId: 'c1' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('requires a purchase or seat for paid courses', async () => {
    coursesService.findByIdOrFail.mockResolvedValue(paidCourse);
    organizationsService.findActiveSeat.mockResolvedValueOnce(null);
    await expect(service.enroll(learner, { courseId: 'c2' })).rejects.toBeInstanceOf(
      PaymentRequiredException,
    );

    organizationsService.findActiveSeat.mockResolvedValueOnce({ id: 'seat-1' });
    enrollments.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'e1' });
    await service.enroll(learner, { courseId: 'c2' });
    expect(enrollments.save).toHaveBeenCalledWith(
      expect.objectContaining({ source: EnrollmentSource.SEAT, seatAssignmentId: 'seat-1' }),
    );
  });

  it('joins the requested cohort of the same course', async () => {
    coursesService.findByIdOrFail.mockResolvedValue(freeCourse);
    cohortsService.findByIdOrFail.mockResolvedValueOnce({ id: 'co-9', courseId: 'other' });
    await expect(service.enroll(learner, { courseId: 'c1', cohortId: 'co-9' })).rejects.toThrow(
      'does not belong',
    );

    cohortsService.findByIdOrFail.mockResolvedValueOnce({ id: 'co-1', courseId: 'c1' });
    enrollments.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'e1' });
    await service.enroll(learner, { courseId: 'c1', cohortId: 'co-1' });
    expect(cohortsService.join).toHaveBeenCalledWith(learner, 'co-1');
    expect(enrollments.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ cohortId: 'co-1' }),
    );
  });

  it('reactivates cancelled enrollments instead of creating new rows', async () => {
    coursesService.findByIdOrFail.mockResolvedValue(freeCourse);
    const cancelled = {
      id: 'old',
      status: EnrollmentStatus.CANCELLED,
      userId: 'lea',
      courseId: 'c1',
    };
    enrollments.findOne.mockResolvedValueOnce(cancelled).mockResolvedValueOnce({ id: 'old' });

    await service.enroll(learner, { courseId: 'c1' });

    expect(enrollments.create).not.toHaveBeenCalled();
    expect(enrollments.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'old', status: EnrollmentStatus.ACTIVE, cancelledAt: null }),
    );
  });

  it('cancels only your own active enrollments and leaves the cohort', async () => {
    enrollments.findOne.mockResolvedValue({
      id: 'e1',
      userId: 'someone-else',
      status: EnrollmentStatus.ACTIVE,
    });
    await expect(service.cancel(learner, 'e1')).rejects.toBeInstanceOf(ForbiddenException);

    enrollments.findOne.mockResolvedValue({
      id: 'e1',
      userId: 'lea',
      status: EnrollmentStatus.COMPLETED,
    });
    await expect(service.cancel(learner, 'e1')).rejects.toBeInstanceOf(BadRequestException);

    enrollments.findOne.mockResolvedValue({
      id: 'e1',
      userId: 'lea',
      courseId: 'c1',
      cohortId: 'co-1',
      status: EnrollmentStatus.ACTIVE,
    });
    const result = await service.cancel(learner, 'e1');
    expect(result.status).toBe(EnrollmentStatus.CANCELLED);
    expect(courses.decrement).toHaveBeenCalledWith({ id: 'c1' }, 'enrollmentCount', 1);
    expect(cohortsService.leave).toHaveBeenCalledWith(learner, 'co-1');
  });

  it('records purchases on existing enrollments or creates paid ones', async () => {
    coursesService.findByIdOrFail.mockResolvedValue(paidCourse);
    enrollments.findOne.mockResolvedValueOnce({
      id: 'e1',
      status: EnrollmentStatus.ACTIVE,
      purchaseId: null,
    });
    const existing = await service.enrollFromPurchase('lea', 'c2', 'p1');
    expect(existing).toMatchObject({ id: 'e1', purchaseId: 'p1' });

    enrollments.findOne.mockResolvedValueOnce(null);
    await service.enrollFromPurchase('lea', 'c2', 'p2');
    expect(enrollments.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ source: EnrollmentSource.PAID, purchaseId: 'p2' }),
    );
  });

  it('completes an enrollment once and notifies handlers, tolerating failures', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const handler = jest.fn().mockResolvedValue(undefined);
    const broken = jest.fn().mockRejectedValue(new Error('boom'));
    service.registerCompletionHandler(broken);
    service.registerCompletionHandler(handler);
    const enrollment = { id: 'e1', status: EnrollmentStatus.ACTIVE } as Enrollment;

    const completed = await service.markCompleted(enrollment, learner);

    expect(completed.status).toBe(EnrollmentStatus.COMPLETED);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1' }), learner);

    await service.markCompleted(completed, learner);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('reports access for active and completed enrollments', async () => {
    enrollments.exists.mockResolvedValue(true);
    await expect(service.hasAccess('lea', 'c1')).resolves.toBe(true);
    expect(enrollments.exists).toHaveBeenCalledWith({
      where: expect.objectContaining({ userId: 'lea', courseId: 'c1' }),
    });
  });
});

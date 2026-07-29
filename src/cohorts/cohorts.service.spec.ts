import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { UserRole } from '../common/enums/user-role.enum';
import { CoursesService } from '../courses/courses.service';
import { CourseStatus } from '../courses/enums/course.enums';
import { type User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { CohortsService } from './cohorts.service';
import { CohortMember } from './entities/cohort-member.entity';
import { CohortSession } from './entities/cohort-session.entity';
import { Cohort } from './entities/cohort.entity';
import { CohortMemberStatus, CohortStatus } from './enums/cohort.enums';

const instructor = { id: 'ins-1', role: UserRole.INSTRUCTOR } as User;
const other = { id: 'ins-2', role: UserRole.INSTRUCTOR } as User;
const admin = { id: 'adm', role: UserRole.ADMIN } as User;
const learner = { id: 'lea', role: UserRole.LEARNER } as User;

function cohortFixture(overrides: Partial<Cohort> = {}): Cohort {
  return {
    id: 'co-1',
    courseId: 'c1',
    instructorId: 'ins-1',
    status: CohortStatus.SCHEDULED,
    capacity: 2,
    enrolledCount: 0,
    waitlistCount: 0,
    startsAt: new Date('2030-01-01T00:00:00Z'),
    endsAt: new Date('2030-02-01T00:00:00Z'),
    course: { id: 'c1', instructorId: 'ins-1', status: CourseStatus.PUBLISHED },
    ...overrides,
  } as Cohort;
}

function repositoryMock(): Record<string, jest.Mock> {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn((value: object) => value),
    save: jest.fn((value: object) => Promise.resolve({ id: 'new-id', ...value })),
    remove: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
}

describe('CohortsService', () => {
  let service: CohortsService;
  const cohorts = repositoryMock();
  const sessions = repositoryMock();
  const members = repositoryMock();
  const manager = {
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn((_entity: unknown, value: object) => value),
    save: jest.fn((_entity: unknown, value: object) => Promise.resolve({ id: 'm-new', ...value })),
    update: jest.fn(),
  };
  const dataSource = {
    transaction: jest.fn((callback: (m: typeof manager) => Promise<unknown>) => callback(manager)),
  };
  const coursesService = { findByIdOrFail: jest.fn(), assertCanManage: jest.fn() };
  const usersService = { findByIdOrFail: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    manager.find.mockResolvedValue([]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        CohortsService,
        { provide: getRepositoryToken(Cohort), useValue: cohorts },
        { provide: getRepositoryToken(CohortSession), useValue: sessions },
        { provide: getRepositoryToken(CohortMember), useValue: members },
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: CoursesService, useValue: coursesService },
        { provide: UsersService, useValue: usersService },
      ],
    }).compile();
    service = moduleRef.get(CohortsService);
  });

  it('lets the cohort instructor, the course owner and staff manage', () => {
    const cohort = cohortFixture({ instructorId: 'ins-3' });
    expect(() => service.assertCanManage(instructor, cohort)).not.toThrow();
    expect(() => service.assertCanManage(admin, cohort)).not.toThrow();
    expect(() =>
      service.assertCanManage({ id: 'ins-3', role: UserRole.INSTRUCTOR }, cohort),
    ).not.toThrow();
    expect(() => service.assertCanManage(other, cohort)).toThrow(ForbiddenException);
  });

  it('creates cohorts with validated dates and the course instructor by default', async () => {
    coursesService.findByIdOrFail.mockResolvedValue({ id: 'c1', instructorId: 'ins-1' });
    cohorts.findOne.mockResolvedValue(cohortFixture());

    await expect(
      service.create(instructor, 'c1', {
        title: 'Bad',
        startsAt: '2030-02-01T00:00:00Z',
        endsAt: '2030-01-01T00:00:00Z',
        capacity: 10,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await service.create(instructor, 'c1', {
      title: ' Spring ',
      startsAt: '2030-01-01T00:00:00Z',
      endsAt: '2030-02-01T00:00:00Z',
      capacity: 10,
    });
    expect(cohorts.save).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Spring', instructorId: 'ins-1', capacity: 10 }),
    );
  });

  it('refuses capacity below the enrolled count', async () => {
    cohorts.findOne.mockResolvedValue(cohortFixture({ enrolledCount: 5 }));

    await expect(service.update(instructor, 'co-1', { capacity: 3 })).rejects.toThrow(
      'Capacity cannot drop',
    );
  });

  it('only deletes cohorts without members', async () => {
    cohorts.findOne.mockResolvedValue(cohortFixture());
    members.count.mockResolvedValueOnce(2);
    await expect(service.remove(instructor, 'co-1')).rejects.toBeInstanceOf(BadRequestException);

    members.count.mockResolvedValueOnce(0);
    await service.remove(instructor, 'co-1');
    expect(cohorts.remove).toHaveBeenCalled();
  });

  describe('join', () => {
    it('rejects closed cohorts, unpublished courses and policy denials', async () => {
      cohorts.findOne.mockResolvedValueOnce(cohortFixture({ status: CohortStatus.CANCELLED }));
      await expect(service.join(learner, 'co-1')).rejects.toBeInstanceOf(BadRequestException);

      cohorts.findOne.mockResolvedValueOnce(
        cohortFixture({ course: { id: 'c1', status: CourseStatus.DRAFT } as Cohort['course'] }),
      );
      await expect(service.join(learner, 'co-1')).rejects.toBeInstanceOf(BadRequestException);

      cohorts.findOne.mockResolvedValue(cohortFixture());
      service.registerJoinPolicy(() => Promise.reject(new ForbiddenException('enrol first')));
      await expect(service.join(learner, 'co-1')).rejects.toThrow('enrol first');
    });

    it('enrolls when a seat is free and increments the enrolled count', async () => {
      cohorts.findOne.mockResolvedValue(cohortFixture());
      manager.findOne.mockResolvedValueOnce(cohortFixture()).mockResolvedValueOnce(null);

      const member = await service.join(learner, 'co-1');

      expect(member).toMatchObject({
        status: CohortMemberStatus.ENROLLED,
        waitlistPosition: null,
        userId: 'lea',
      });
      expect(manager.update).toHaveBeenCalledWith(Cohort, { id: 'co-1' }, { enrolledCount: 1 });
    });

    it('waitlists when the cohort is full', async () => {
      cohorts.findOne.mockResolvedValue(cohortFixture());
      manager.findOne
        .mockResolvedValueOnce(cohortFixture({ enrolledCount: 2, waitlistCount: 1 }))
        .mockResolvedValueOnce(null);

      const member = await service.join(learner, 'co-1');

      expect(member).toMatchObject({ status: CohortMemberStatus.WAITLISTED, waitlistPosition: 2 });
      expect(manager.update).toHaveBeenCalledWith(Cohort, { id: 'co-1' }, { waitlistCount: 2 });
    });

    it('rejects duplicates but lets dropped learners rejoin', async () => {
      cohorts.findOne.mockResolvedValue(cohortFixture());
      manager.findOne
        .mockResolvedValueOnce(cohortFixture())
        .mockResolvedValueOnce({ status: CohortMemberStatus.ENROLLED });
      await expect(service.join(learner, 'co-1')).rejects.toBeInstanceOf(ConflictException);

      manager.findOne
        .mockResolvedValueOnce(cohortFixture())
        .mockResolvedValueOnce({ id: 'old', status: CohortMemberStatus.DROPPED });
      const member = await service.join(learner, 'co-1');
      expect(member).toMatchObject({ id: 'old', status: CohortMemberStatus.ENROLLED });
    });
  });

  describe('leave', () => {
    it('fails for non members', async () => {
      manager.findOne.mockResolvedValueOnce(cohortFixture()).mockResolvedValueOnce(null);

      await expect(service.leave(learner, 'co-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('promotes the first waitlisted learner when an enrolled learner leaves', async () => {
      manager.findOne
        .mockResolvedValueOnce(cohortFixture({ enrolledCount: 2, waitlistCount: 1 }))
        .mockResolvedValueOnce({ id: 'm1', status: CohortMemberStatus.ENROLLED })
        .mockResolvedValueOnce({
          id: 'm2',
          status: CohortMemberStatus.WAITLISTED,
          waitlistPosition: 1,
        });

      const promoted = await service.leave(learner, 'co-1');

      expect(promoted).toMatchObject({ id: 'm2', status: CohortMemberStatus.ENROLLED });
      expect(manager.update).toHaveBeenLastCalledWith(
        Cohort,
        { id: 'co-1' },
        { enrolledCount: 2, waitlistCount: 0 },
      );
    });

    it('renumbers the waitlist when a waitlisted learner leaves', async () => {
      manager.findOne
        .mockResolvedValueOnce(cohortFixture({ enrolledCount: 2, waitlistCount: 2 }))
        .mockResolvedValueOnce({ id: 'm1', status: CohortMemberStatus.WAITLISTED });
      manager.find.mockResolvedValueOnce([{ id: 'm3', waitlistPosition: 2 }]);

      const promoted = await service.leave(learner, 'co-1');

      expect(promoted).toBeNull();
      expect(manager.update).toHaveBeenCalledWith(
        CohortMember,
        { id: 'm3' },
        { waitlistPosition: 1 },
      );
      expect(manager.update).toHaveBeenLastCalledWith(
        Cohort,
        { id: 'co-1' },
        { enrolledCount: 2, waitlistCount: 1 },
      );
    });
  });

  it('lists public cohorts of published courses that have not ended', async () => {
    const builder = {
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    cohorts.createQueryBuilder.mockReturnValue(builder);

    await service.listPublic({ page: 1, limit: 10, upcomingOnly: true, courseId: 'c1' });

    expect(builder.innerJoinAndSelect).toHaveBeenCalledWith(
      'cohort.course',
      'course',
      'course.status = :published',
      { published: CourseStatus.PUBLISHED },
    );
    expect(builder.andWhere).toHaveBeenCalledWith('cohort.courseId = :courseId', {
      courseId: 'c1',
    });
    expect(builder.andWhere).toHaveBeenCalledWith('cohort.endsAt > :now', {
      now: expect.any(Date) as Date,
    });
  });
});

import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserRole } from '../common/enums/user-role.enum';
import { type User } from '../users/entities/user.entity';
import { AttendanceService } from './attendance.service';
import { CohortsManageController } from './cohorts-manage.controller';
import { CohortsController } from './cohorts.controller';
import { CohortsService } from './cohorts.service';
import { SessionAttendance } from './entities/session-attendance.entity';
import { AttendanceStatus, CohortMemberStatus, CohortStatus } from './enums/cohort.enums';

const instructor = { id: 'ins-1', role: UserRole.INSTRUCTOR } as User;

describe('AttendanceService', () => {
  let service: AttendanceService;
  const attendance = {
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn((value: object) => value),
    save: jest.fn((rows: object[]) => Promise.resolve(rows)),
  };
  const cohortsService = {
    loadSession: jest.fn().mockResolvedValue({ id: 's1', cohortId: 'co-1' }),
    enrolledUserIds: jest.fn().mockResolvedValue(new Set(['u1', 'u2'])),
    findManaged: jest.fn(),
    roster: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    attendance.find.mockResolvedValue([]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        AttendanceService,
        { provide: getRepositoryToken(SessionAttendance), useValue: attendance },
        { provide: CohortsService, useValue: cohortsService },
      ],
    }).compile();
    service = moduleRef.get(AttendanceService);
  });

  it('rejects learners who are not enrolled', async () => {
    await expect(
      service.mark(instructor, 's1', {
        entries: [{ userId: 'ghost', status: AttendanceStatus.PRESENT }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('upserts attendance rows, reusing existing ones', async () => {
    attendance.find.mockResolvedValue([
      { id: 'a1', sessionId: 's1', userId: 'u1', status: 'ABSENT' },
    ]);

    const rows = await service.mark(instructor, 's1', {
      entries: [
        { userId: 'u1', status: AttendanceStatus.PRESENT },
        { userId: 'u2', status: AttendanceStatus.EXCUSED, note: 'ill' },
      ],
    });

    expect(rows).toEqual([
      expect.objectContaining({ id: 'a1', status: AttendanceStatus.PRESENT, markedById: 'ins-1' }),
      expect.objectContaining({ userId: 'u2', status: AttendanceStatus.EXCUSED, note: 'ill' }),
    ]);
  });

  it('summarises attendance for held sessions only', async () => {
    const past = new Date(Date.now() - 3600_000);
    const future = new Date(Date.now() + 3600_000);
    cohortsService.findManaged.mockResolvedValue({
      id: 'co-1',
      sessions: [
        { id: 's1', endsAt: past },
        { id: 's2', endsAt: past },
        { id: 's3', endsAt: future },
      ],
    });
    cohortsService.roster.mockResolvedValue([
      {
        userId: 'u1',
        status: CohortMemberStatus.ENROLLED,
        user: { firstName: 'A', lastName: 'B' },
      },
      { userId: 'u9', status: CohortMemberStatus.DROPPED, user: { firstName: 'X', lastName: 'Y' } },
    ]);
    attendance.find.mockResolvedValue([
      { userId: 'u1', sessionId: 's1', status: AttendanceStatus.PRESENT },
      { userId: 'u1', sessionId: 's2', status: AttendanceStatus.LATE },
    ]);

    const summary = await service.summary(instructor, 'co-1');

    expect(summary.sessionsHeld).toBe(2);
    expect(summary.members).toEqual([
      expect.objectContaining({
        userId: 'u1',
        fullName: 'A B',
        present: 1,
        late: 1,
        absent: 0,
        unmarked: 0,
        attendanceRate: 100,
      }),
    ]);
  });
});

describe('cohort controllers', () => {
  const cohort = {
    id: 'co-1',
    courseId: 'c1',
    title: 'Spring',
    description: null,
    startsAt: new Date(),
    endsAt: new Date(),
    timezone: 'UTC',
    capacity: 2,
    enrolledCount: 1,
    waitlistCount: 0,
    status: CohortStatus.SCHEDULED,
    instructor: null,
    course: { id: 'c1', title: 'TS', slug: 'ts' },
    sessions: [],
    createdAt: new Date(),
  };
  const member = {
    id: 'm1',
    cohortId: 'co-1',
    status: CohortMemberStatus.ENROLLED,
    waitlistPosition: null,
    joinedAt: new Date(),
    user: { id: 'u1', firstName: 'A', lastName: 'B', email: 'a@b.c', avatarUrl: null },
  };
  const cohortsService = {
    listPublic: jest.fn().mockResolvedValue({ items: [cohort], meta: { total: 1 } }),
    mine: jest.fn().mockResolvedValue([member]),
    findPublic: jest.fn().mockResolvedValue(cohort),
    join: jest.fn().mockResolvedValue(member),
    leave: jest.fn().mockResolvedValue(null),
    listManaged: jest.fn().mockResolvedValue({ items: [cohort], meta: { total: 1 } }),
    create: jest.fn().mockResolvedValue(cohort),
    findManaged: jest.fn().mockResolvedValue(cohort),
    update: jest.fn().mockResolvedValue(cohort),
    cancel: jest.fn().mockResolvedValue({ ...cohort, status: CohortStatus.CANCELLED }),
    remove: jest.fn(),
    roster: jest.fn().mockResolvedValue([member]),
    addSession: jest
      .fn()
      .mockResolvedValue({ id: 's1', cohortId: 'co-1', startsAt: new Date(), endsAt: new Date() }),
    updateSession: jest.fn(),
    removeSession: jest.fn(),
  };
  const attendanceService = {
    mark: jest.fn().mockResolvedValue([]),
    listForSession: jest.fn().mockResolvedValue([]),
    summary: jest.fn().mockResolvedValue({ cohortId: 'co-1', sessionsHeld: 0, members: [] }),
  };

  it('exposes public listing, detail, join and leave', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CohortsController],
      providers: [{ provide: CohortsService, useValue: cohortsService }],
    }).compile();
    const controller = moduleRef.get(CohortsController);

    const page = await controller.list({ page: 1, limit: 10, upcomingOnly: true });
    expect(page.items[0]).toMatchObject({ id: 'co-1', seatsLeft: 1, course: { slug: 'ts' } });

    const joined = await controller.join(instructor, 'co-1');
    expect(joined.user).toEqual({ id: 'u1', fullName: 'A B', avatarUrl: null });

    const left = await controller.leave(instructor, 'co-1');
    expect(left).toEqual({ promoted: null });
  });

  it('exposes the roster with emails and attendance for managers', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CohortsManageController],
      providers: [
        { provide: CohortsService, useValue: cohortsService },
        { provide: AttendanceService, useValue: attendanceService },
      ],
    }).compile();
    const controller = moduleRef.get(CohortsManageController);

    const roster = await controller.roster(instructor, 'co-1');
    expect(roster[0].user?.email).toBe('a@b.c');

    const cancelled = await controller.cancel(instructor, 'co-1');
    expect(cancelled.status).toBe(CohortStatus.CANCELLED);

    await controller.markAttendance(instructor, 's1', {
      entries: [{ userId: 'u1', status: AttendanceStatus.PRESENT }],
    });
    expect(attendanceService.mark).toHaveBeenCalled();

    const summary = await controller.attendanceSummary(instructor, 'co-1');
    expect(summary.cohortId).toBe('co-1');
  });
});

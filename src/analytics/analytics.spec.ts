import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { UserRole } from '../common/enums/user-role.enum';
import { type User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { AnalyticsController, InstructorPerformanceController } from './analytics.controller';
import { AnalyticsService, resolveRange } from './analytics.service';
import { InstructorPerformanceBaseline } from './entities/instructor-performance-baseline.entity';
import { InstructorPerformanceService } from './instructor-performance.service';

const admin = { id: 'admin', role: UserRole.ADMIN } as User;
const instructor = {
  id: 'ins',
  role: UserRole.INSTRUCTOR,
  firstName: 'Ivo',
  lastName: 'Teach',
  email: 'ivo@x.test',
} as User;

describe('resolveRange', () => {
  it('defaults to a window that fits the granularity', () => {
    const day = resolveRange({ granularity: 'day' });
    const month = resolveRange({ granularity: 'month' });

    expect(day.to.getTime() - day.from.getTime()).toBe(30 * 24 * 3600 * 1000);
    expect(month.to.getTime() - month.from.getTime()).toBe(365 * 24 * 3600 * 1000);
  });

  it('rejects inverted or invalid ranges', () => {
    expect(() =>
      resolveRange({ from: '2026-02-01', to: '2026-01-01', granularity: 'day' }),
    ).toThrow(BadRequestException);
    expect(() => resolveRange({ from: 'nope', granularity: 'day' })).toThrow(BadRequestException);
  });
});

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  const dataSource = { query: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [AnalyticsService, { provide: getDataSourceToken(), useValue: dataSource }],
    }).compile();
    service = moduleRef.get(AnalyticsService);
  });

  it('parses the overview counters', async () => {
    dataSource.query.mockResolvedValue([
      {
        users: '12',
        published_courses: '3',
        active_enrollments: '20',
        completed_enrollments: '5',
        active_cohorts: '2',
        revenue_cents: '99000',
        refunded_cents: '9900',
      },
    ]);

    await expect(service.overview()).resolves.toEqual({
      users: 12,
      publishedCourses: 3,
      activeEnrollments: 20,
      completedEnrollments: 5,
      activeCohorts: 2,
      revenueCents: 99000,
      refundedCents: 9900,
    });
  });

  it('buckets revenue by period and currency', async () => {
    dataSource.query.mockResolvedValue([
      {
        bucket: new Date('2026-03-01T00:00:00Z'),
        currency: 'USD',
        revenue_cents: '5000',
        refunded_cents: '0',
        purchases: '2',
      },
    ]);

    const points = await service.revenueOverTime({
      from: '2026-03-01',
      to: '2026-04-01',
      granularity: 'month',
    });

    expect(points).toEqual([
      { bucket: '2026-03-01', currency: 'USD', revenueCents: 5000, refundedCents: 0, purchases: 2 },
    ]);
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('date_trunc($1, paid_at)'),
      ['month', new Date('2026-03-01'), new Date('2026-04-01')],
    );
  });

  it('maps enrollment series, top courses and cohort completion', async () => {
    dataSource.query.mockResolvedValueOnce([
      { bucket: '2026-03-02', enrollments: '4', completions: '1' },
    ]);
    const series = await service.enrollmentsOverTime({ granularity: 'day' });
    expect(series).toEqual([{ bucket: '2026-03-02', enrollments: 4, completions: 1 }]);

    dataSource.query.mockResolvedValueOnce([
      {
        course_id: 'c1',
        title: 'TS',
        slug: 'ts',
        enrollments: '9',
        completions: '3',
        revenue_cents: '12000',
      },
    ]);
    const top = await service.topCourses({ granularity: 'day', limit: 5 });
    expect(top[0]).toEqual({
      courseId: 'c1',
      title: 'TS',
      slug: 'ts',
      enrollments: 9,
      completions: 3,
      revenueCents: 12000,
    });
    expect(dataSource.query).toHaveBeenLastCalledWith(expect.stringContaining('LIMIT $3'), [
      expect.any(Date),
      expect.any(Date),
      5,
    ]);

    dataSource.query.mockResolvedValueOnce([
      {
        cohort_id: 'co',
        title: 'Spring',
        course_title: 'TS',
        status: 'ACTIVE',
        starts_at: new Date(),
        ends_at: new Date(),
        enrolled: '8',
        completed: '2',
      },
      {
        cohort_id: 'co2',
        title: 'Empty',
        course_title: 'TS',
        status: 'SCHEDULED',
        starts_at: new Date(),
        ends_at: new Date(),
        enrolled: '0',
        completed: '0',
      },
    ]);
    const cohorts = await service.cohortCompletionRates({ granularity: 'day' });
    expect(cohorts[0]).toMatchObject({
      cohortId: 'co',
      enrolled: 8,
      completed: 2,
      completionRate: 25,
    });
    expect(cohorts[1].completionRate).toBe(0);
  });
});

describe('InstructorPerformanceService', () => {
  let service: InstructorPerformanceService;
  const baselines = {
    findOne: jest.fn(),
    create: jest.fn((value: object) => value),
    save: jest.fn((value: object) => Promise.resolve({ id: 'b1', ...value })),
  };
  const dataSource = { query: jest.fn() };
  const usersService = { findByIdOrFail: jest.fn().mockResolvedValue(instructor) };

  beforeEach(async () => {
    jest.clearAllMocks();
    baselines.findOne.mockResolvedValue(null);
    dataSource.query.mockResolvedValue([
      {
        published_courses: '2',
        cohorts_run: '1',
        enrollments: '10',
        completions: '4',
        distinct_learners: '9',
        revenue_cents: '45000',
        average_progress: '61.4',
        graded_submissions: '7',
      },
    ]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        InstructorPerformanceService,
        { provide: getRepositoryToken(InstructorPerformanceBaseline), useValue: baselines },
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: UsersService, useValue: usersService },
      ],
    }).compile();
    service = moduleRef.get(InstructorPerformanceService);
  });

  it('lets admins view anyone and instructors only themselves', () => {
    expect(() => service.assertCanView(admin, 'ins')).not.toThrow();
    expect(() => service.assertCanView(instructor, 'ins')).not.toThrow();
    expect(() => service.assertCanView(instructor, 'other')).toThrow(ForbiddenException);
  });

  it('summarises performance from the epoch when never reset', async () => {
    const summary = await service.summary(admin, 'ins');

    expect(summary).toMatchObject({
      instructor: { id: 'ins', fullName: 'Ivo Teach' },
      since: null,
      enrollments: 10,
      completions: 4,
      completionRate: 40,
      revenueCents: 45000,
      averageProgressPercent: 61,
      gradedSubmissions: 7,
    });
    expect(dataSource.query).toHaveBeenCalledWith(expect.any(String), ['ins', new Date(0)]);
  });

  it('counts from the baseline after a reset', async () => {
    const resetAt = new Date('2026-01-01T00:00:00Z');
    baselines.findOne.mockResolvedValue({ userId: 'ins', resetAt });

    const summary = await service.summary(instructor, 'ins');

    expect(summary.since).toEqual(resetAt);
    expect(dataSource.query).toHaveBeenCalledWith(expect.any(String), ['ins', resetAt]);
  });

  it('creates or moves the baseline on reset', async () => {
    const created = await service.reset(admin, 'ins', ' Q2 ');
    expect(created).toMatchObject({ userId: 'ins', resetById: 'admin', note: 'Q2' });
    expect(created.resetAt).toBeInstanceOf(Date);

    baselines.findOne.mockResolvedValue({ id: 'b1', userId: 'ins', resetAt: new Date(0) });
    const moved = await service.reset(admin, 'ins');
    expect(moved.note).toBeNull();
    expect(baselines.create).toHaveBeenCalledTimes(1);
  });
});

describe('analytics controllers', () => {
  it('delegate to the services', async () => {
    const analyticsService = {
      overview: jest.fn().mockResolvedValue({ users: 1 }),
      revenueOverTime: jest.fn().mockResolvedValue([]),
      enrollmentsOverTime: jest.fn().mockResolvedValue([]),
      topCourses: jest.fn().mockResolvedValue([]),
      cohortCompletionRates: jest.fn().mockResolvedValue([]),
    };
    const performanceService = {
      summary: jest.fn().mockResolvedValue({ enrollments: 3 }),
      reset: jest.fn().mockResolvedValue({ resetAt: new Date(), note: null }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [AnalyticsController, InstructorPerformanceController],
      providers: [
        { provide: AnalyticsService, useValue: analyticsService },
        { provide: InstructorPerformanceService, useValue: performanceService },
      ],
    }).compile();
    const analytics = moduleRef.get(AnalyticsController);
    const performance = moduleRef.get(InstructorPerformanceController);

    await expect(analytics.overview()).resolves.toEqual({ users: 1 });
    await analytics.topCourses({ granularity: 'week', limit: 3 });
    expect(analyticsService.topCourses).toHaveBeenCalledWith({ granularity: 'week', limit: 3 });

    await expect(performance.summary(admin, 'ins')).resolves.toEqual({ enrollments: 3 });
    const reset = await performance.reset(admin, 'ins', { note: 'x' });
    expect(reset.resetAt).toBeInstanceOf(Date);
    expect(performanceService.reset).toHaveBeenCalledWith(admin, 'ins', 'x');
  });
});

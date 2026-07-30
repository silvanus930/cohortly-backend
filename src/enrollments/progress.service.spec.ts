import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserRole } from '../common/enums/user-role.enum';
import { CurriculumService } from '../courses/curriculum.service';
import { Lesson } from '../courses/entities/lesson.entity';
import { LessonType } from '../courses/enums/course.enums';
import { type User } from '../users/entities/user.entity';
import { EnrollmentsService } from './enrollments.service';
import { type Enrollment } from './entities/enrollment.entity';
import { LearningActivityDay } from './entities/learning-activity.entity';
import { LessonProgress } from './entities/lesson-progress.entity';
import { EnrollmentStatus, LessonProgressStatus } from './enums/enrollment.enums';
import { ProgressService, toDateKey } from './progress.service';

const learner = { id: 'lea', role: UserRole.LEARNER } as User;
const DAY_MS = 24 * 60 * 60 * 1000;

function enrollmentFixture(): Enrollment {
  return {
    id: 'e1',
    userId: 'lea',
    courseId: 'c1',
    status: EnrollmentStatus.ACTIVE,
    progressPercent: 0,
    completedLessons: 0,
    totalLessons: 2,
  } as Enrollment;
}

describe('ProgressService', () => {
  let service: ProgressService;
  const progress = {
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn((value: object) => value),
    save: jest.fn((value: object) => Promise.resolve({ id: 'p1', ...value })),
  };
  const activity = {
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    increment: jest.fn(),
    create: jest.fn((value: object) => value),
    save: jest.fn((value: object) => Promise.resolve(value)),
  };
  const lessons = { findOne: jest.fn(), count: jest.fn().mockResolvedValue(2) };
  const enrollmentsService = {
    requireAccessible: jest.fn(),
    save: jest.fn((value: Enrollment) => Promise.resolve(value)),
    markCompleted: jest.fn((value: Enrollment) =>
      Promise.resolve({ ...value, status: EnrollmentStatus.COMPLETED }),
    ),
  };
  const curriculumService = { listModules: jest.fn().mockResolvedValue([]) };

  beforeEach(async () => {
    jest.clearAllMocks();
    progress.findOne.mockResolvedValue(null);
    progress.find.mockResolvedValue([]);
    progress.count.mockResolvedValue(0);
    activity.findOne.mockResolvedValue(null);
    activity.find.mockResolvedValue([]);
    lessons.count.mockResolvedValue(2);
    lessons.findOne.mockResolvedValue({ id: 'l1', courseId: 'c1', type: LessonType.VIDEO });
    enrollmentsService.requireAccessible.mockResolvedValue(enrollmentFixture());
    const moduleRef = await Test.createTestingModule({
      providers: [
        ProgressService,
        { provide: getRepositoryToken(LessonProgress), useValue: progress },
        { provide: getRepositoryToken(LearningActivityDay), useValue: activity },
        { provide: getRepositoryToken(Lesson), useValue: lessons },
        { provide: EnrollmentsService, useValue: enrollmentsService },
        { provide: CurriculumService, useValue: curriculumService },
      ],
    }).compile();
    service = moduleRef.get(ProgressService);
  });

  it('fails for unknown lessons and learners without access', async () => {
    lessons.findOne.mockResolvedValueOnce(null);
    await expect(
      service.update(learner, 'nope', { status: LessonProgressStatus.IN_PROGRESS }),
    ).rejects.toBeInstanceOf(NotFoundException);

    enrollmentsService.requireAccessible.mockRejectedValueOnce(new ForbiddenException());
    await expect(
      service.update(learner, 'l1', { status: LessonProgressStatus.IN_PROGRESS }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('records in progress state with playback position and activity', async () => {
    const result = await service.update(learner, 'l1', {
      status: LessonProgressStatus.IN_PROGRESS,
      positionSeconds: 120,
    });

    expect(result.progress).toMatchObject({
      status: LessonProgressStatus.IN_PROGRESS,
      positionSeconds: 120,
      startedAt: expect.any(Date) as Date,
      completedAt: null,
    });
    expect(activity.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'lea', lessonsCompleted: 0 }),
    );
    expect(result.enrollment.progressPercent).toBe(0);
    expect(enrollmentsService.markCompleted).not.toHaveBeenCalled();
  });

  it('runs gates before completing a lesson', async () => {
    service.registerLessonGate(() => Promise.reject(new ForbiddenException('pass the quiz')));

    await expect(
      service.update(learner, 'l1', { status: LessonProgressStatus.COMPLETED }),
    ).rejects.toThrow('pass the quiz');
    expect(progress.save).not.toHaveBeenCalled();
  });

  it('completes the course when the last lesson is finished', async () => {
    progress.count.mockResolvedValue(2);

    const result = await service.update(learner, 'l1', { status: LessonProgressStatus.COMPLETED });

    expect(result.progress.status).toBe(LessonProgressStatus.COMPLETED);
    expect(enrollmentsService.save).toHaveBeenCalledWith(
      expect.objectContaining({ completedLessons: 2, totalLessons: 2, progressPercent: 100 }),
    );
    expect(enrollmentsService.markCompleted).toHaveBeenCalled();
    expect(result.enrollment.status).toBe(EnrollmentStatus.COMPLETED);
  });

  it('never downgrades a completed lesson and counts a day once', async () => {
    progress.findOne.mockResolvedValue({
      id: 'p1',
      status: LessonProgressStatus.COMPLETED,
      completedAt: new Date('2024-01-01'),
      startedAt: new Date('2024-01-01'),
      positionSeconds: 10,
    });
    activity.findOne.mockResolvedValue({ id: 'a1' });

    const result = await service.update(learner, 'l1', {
      status: LessonProgressStatus.IN_PROGRESS,
    });

    expect(result.progress.status).toBe(LessonProgressStatus.COMPLETED);
    expect(activity.increment).not.toHaveBeenCalled();
    expect(activity.save).not.toHaveBeenCalled();
  });

  it('builds the outline with statuses and the next incomplete lesson', async () => {
    curriculumService.listModules.mockResolvedValue([
      {
        id: 'm1',
        title: 'Module',
        position: 0,
        lessons: [
          {
            id: 'l2',
            title: 'B',
            type: LessonType.READING,
            position: 1,
            durationMinutes: 5,
            isPreview: false,
          },
          {
            id: 'l1',
            title: 'A',
            type: LessonType.VIDEO,
            position: 0,
            durationMinutes: 10,
            isPreview: true,
          },
        ],
      },
    ]);
    progress.find.mockResolvedValue([
      {
        lessonId: 'l1',
        status: LessonProgressStatus.COMPLETED,
        positionSeconds: 0,
        completedAt: new Date(),
      },
    ]);

    const result = await service.courseProgress(learner, 'c1');

    expect(result.modules[0].lessons.map((l) => l.id)).toEqual(['l1', 'l2']);
    expect(result.modules[0].lessons[0].status).toBe(LessonProgressStatus.COMPLETED);
    expect(result.nextLesson?.id).toBe('l2');
  });

  it('computes current and longest streaks from activity days', async () => {
    const today = new Date();
    const day = (offset: number): { activityDate: string } => ({
      activityDate: toDateKey(new Date(today.getTime() - offset * DAY_MS)),
    });
    activity.find.mockResolvedValue([day(0), day(1), day(2), day(5), day(6), day(7), day(8)]);

    const streak = await service.streak('lea');

    expect(streak.currentStreak).toBe(3);
    expect(streak.longestStreak).toBe(4);
    expect(streak.activeDaysLast30).toBe(7);
    expect(streak.lastActiveDate).toBe(toDateKey(today));
  });

  it('keeps the streak alive when the last activity was yesterday', async () => {
    const yesterday = toDateKey(new Date(Date.now() - DAY_MS));
    activity.find.mockResolvedValue([{ activityDate: yesterday }]);

    const streak = await service.streak('lea');

    expect(streak.currentStreak).toBe(1);
  });

  it('reports an empty streak for new learners', async () => {
    await expect(service.streak('lea')).resolves.toEqual({
      currentStreak: 0,
      longestStreak: 0,
      activeDaysLast30: 0,
      lastActiveDate: null,
    });
  });
});

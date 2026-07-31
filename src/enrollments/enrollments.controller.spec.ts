import { Test } from '@nestjs/testing';
import { UserRole } from '../common/enums/user-role.enum';
import { type User } from '../users/entities/user.entity';
import { EnrollmentsController, EnrollmentsManageController } from './enrollments.controller';
import { EnrollmentsService } from './enrollments.service';
import { EnrollmentSource, EnrollmentStatus, LessonProgressStatus } from './enums/enrollment.enums';
import { ProgressService } from './progress.service';

const learner = { id: 'lea', role: UserRole.LEARNER } as User;
const instructor = { id: 'ins', role: UserRole.INSTRUCTOR } as User;
const enrollment = {
  id: 'e1',
  courseId: 'c1',
  course: null,
  cohortId: null,
  source: EnrollmentSource.FREE,
  status: EnrollmentStatus.ACTIVE,
  progressPercent: 50,
  completedLessons: 1,
  totalLessons: 2,
  lastActivityAt: null,
  completedAt: null,
  createdAt: new Date(),
  user: { id: 'lea', firstName: 'Lea', lastName: 'Rner', email: 'lea@x.test', avatarUrl: null },
};
const lessonItem = {
  id: 'l2',
  title: 'B',
  type: 'READING',
  position: 1,
  durationMinutes: 5,
  isPreview: false,
  status: LessonProgressStatus.NOT_STARTED,
  positionSeconds: 0,
  completedAt: null,
};

describe('EnrollmentsController', () => {
  let controller: EnrollmentsController;
  let manage: EnrollmentsManageController;
  const enrollmentsService = {
    enroll: jest.fn().mockResolvedValue(enrollment),
    listMine: jest.fn().mockResolvedValue({ items: [enrollment], meta: { total: 1 } }),
    mostRecentActive: jest.fn().mockResolvedValue(enrollment),
    cancel: jest.fn().mockResolvedValue({ ...enrollment, status: EnrollmentStatus.CANCELLED }),
    listForCourse: jest.fn().mockResolvedValue({ items: [enrollment], meta: { total: 1 } }),
  };
  const progressService = {
    nextLesson: jest.fn().mockResolvedValue(lessonItem),
    streak: jest.fn().mockResolvedValue({ currentStreak: 2 }),
    courseProgress: jest
      .fn()
      .mockResolvedValue({ enrollment, modules: [], nextLesson: lessonItem }),
    update: jest.fn().mockResolvedValue({
      progress: {
        lessonId: 'l1',
        status: LessonProgressStatus.COMPLETED,
        positionSeconds: 0,
        startedAt: null,
        completedAt: new Date(),
      },
      enrollment,
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [EnrollmentsController, EnrollmentsManageController],
      providers: [
        { provide: EnrollmentsService, useValue: enrollmentsService },
        { provide: ProgressService, useValue: progressService },
      ],
    }).compile();
    controller = moduleRef.get(EnrollmentsController);
    manage = moduleRef.get(EnrollmentsManageController);
  });

  it('enrolls and lists without exposing learner details', async () => {
    const created = await controller.enroll(learner, { courseId: 'c1' });
    expect(created).toMatchObject({ id: 'e1', progressPercent: 50 });
    expect(created).not.toHaveProperty('learner');

    const page = await controller.mine(learner, { page: 1, limit: 10 });
    expect(page.items).toHaveLength(1);
  });

  it('returns the continue learning card and null when nothing is active', async () => {
    const card = await controller.continueLearning(learner);
    expect(card?.nextLesson?.id).toBe('l2');

    enrollmentsService.mostRecentActive.mockResolvedValueOnce(null);
    await expect(controller.continueLearning(learner)).resolves.toBeNull();
  });

  it('forwards progress updates, course progress, streaks and cancellation', async () => {
    const update = await controller.updateProgress(learner, 'l1', {
      status: LessonProgressStatus.COMPLETED,
    });
    expect(update.progress.status).toBe(LessonProgressStatus.COMPLETED);

    const progress = await controller.courseProgress(learner, 'c1');
    expect(progress.nextLesson?.id).toBe('l2');

    await expect(controller.streak('lea')).resolves.toEqual({ currentStreak: 2 });

    const cancelled = await controller.cancel(learner, 'e1');
    expect(cancelled.status).toBe(EnrollmentStatus.CANCELLED);
  });

  it('includes learner details for instructors', async () => {
    const page = await manage.listForCourse(instructor, 'c1', { page: 1, limit: 10 });

    expect(page.items[0].learner).toMatchObject({ email: 'lea@x.test', fullName: 'Lea Rner' });
  });
});

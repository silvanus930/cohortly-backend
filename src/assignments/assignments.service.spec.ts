import { BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserRole } from '../common/enums/user-role.enum';
import { appConfig } from '../config/configuration';
import { CoursesService } from '../courses/courses.service';
import { CurriculumService } from '../courses/curriculum.service';
import { LessonType } from '../courses/enums/course.enums';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { LessonProgressStatus } from '../enrollments/enums/enrollment.enums';
import { ProgressService } from '../enrollments/progress.service';
import { MailService } from '../mail/mail.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { StorageService } from '../storage/storage.service';
import { type User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { AssignmentsService, submissionPassed } from './assignments.service';
import { Assignment } from './entities/assignment.entity';
import { Submission } from './entities/submission.entity';
import { SubmissionStatus, SubmissionType } from './enums/assignment.enums';

const instructor = { id: 'ins', role: UserRole.INSTRUCTOR } as User;
const learner = {
  id: 'lea',
  role: UserRole.LEARNER,
  firstName: 'Lea',
  lastName: 'R',
  email: 'lea@x.test',
} as User;

function assignmentFixture(overrides: Partial<Assignment> = {}): Assignment {
  return {
    id: 'as-1',
    lessonId: 'l1',
    courseId: 'c1',
    title: 'Essay',
    instructions: 'Write',
    submissionType: SubmissionType.TEXT_OR_FILE,
    maxPoints: 100,
    passingPoints: 60,
    rubric: [],
    allowResubmission: true,
    maxSubmissions: 2,
    ...overrides,
  } as Assignment;
}

describe('AssignmentsService', () => {
  let service: AssignmentsService;
  const assignments = {
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn((value: object) => value),
    save: jest.fn((value: object) => Promise.resolve({ id: 'as-1', ...value })),
    remove: jest.fn(),
  };
  const submissions = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    create: jest.fn((value: object) => value),
    save: jest.fn((value: object) => Promise.resolve({ id: 'sub-1', ...value })),
  };
  const coursesService = {
    findByIdOrFail: jest
      .fn()
      .mockResolvedValue({ id: 'c1', instructorId: 'ins', title: 'TS', slug: 'ts' }),
    assertCanManage: jest.fn(),
  };
  const curriculumService = { findLessonForManage: jest.fn() };
  const enrollmentsService = { requireAccessible: jest.fn().mockResolvedValue({ id: 'e1' }) };
  const progressService = { update: jest.fn().mockResolvedValue({}) };
  const storageService = { createPresignedUpload: jest.fn().mockResolvedValue({ key: 'k' }) };
  const notificationsService = { notify: jest.fn() };
  const mailService = { sendGradePosted: jest.fn().mockResolvedValue(undefined) };
  const usersService = { findByIdOrFail: jest.fn().mockResolvedValue(learner) };

  beforeEach(async () => {
    jest.clearAllMocks();
    submissions.find.mockResolvedValue([]);
    assignments.findOne.mockResolvedValue(assignmentFixture());
    coursesService.findByIdOrFail.mockResolvedValue({
      id: 'c1',
      instructorId: 'ins',
      title: 'TS',
      slug: 'ts',
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        AssignmentsService,
        { provide: getRepositoryToken(Assignment), useValue: assignments },
        { provide: getRepositoryToken(Submission), useValue: submissions },
        { provide: CoursesService, useValue: coursesService },
        { provide: CurriculumService, useValue: curriculumService },
        { provide: EnrollmentsService, useValue: enrollmentsService },
        { provide: ProgressService, useValue: progressService },
        { provide: StorageService, useValue: storageService },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: MailService, useValue: mailService },
        { provide: UsersService, useValue: usersService },
        { provide: appConfig.KEY, useValue: { url: 'https://app.test' } },
      ],
    }).compile();
    service = moduleRef.get(AssignmentsService);
  });

  it('derives pass state from the passing points', () => {
    const assignment = assignmentFixture();
    expect(submissionPassed({ score: null } as Submission, assignment)).toBeNull();
    expect(submissionPassed({ score: 60 } as Submission, assignment)).toBe(true);
    expect(submissionPassed({ score: 59 } as Submission, assignment)).toBe(false);
  });

  describe('upsert', () => {
    it('requires an ASSIGNMENT lesson and a rubric that adds up', async () => {
      curriculumService.findLessonForManage.mockResolvedValue({
        id: 'l1',
        courseId: 'c1',
        type: LessonType.VIDEO,
      });
      await expect(
        service.upsert(instructor, 'l1', { title: 'E', instructions: 'x' }),
      ).rejects.toBeInstanceOf(BadRequestException);

      curriculumService.findLessonForManage.mockResolvedValue({
        id: 'l1',
        courseId: 'c1',
        type: LessonType.ASSIGNMENT,
      });
      await expect(
        service.upsert(instructor, 'l1', {
          title: 'E',
          instructions: 'x',
          maxPoints: 100,
          rubric: [{ id: 'a', criterion: 'A', maxPoints: 40 }],
        }),
      ).rejects.toThrow('add up to 40');

      assignments.findOne.mockResolvedValue(null);
      const created = await service.upsert(instructor, 'l1', {
        title: ' Essay ',
        instructions: 'Write it',
        maxPoints: 50,
        rubric: [
          { id: 'a', criterion: 'A', maxPoints: 30 },
          { id: 'b', criterion: 'B', maxPoints: 20 },
        ],
      });
      expect(created).toMatchObject({ title: 'Essay', maxPoints: 50, passingPoints: 30 });
      expect(created.rubric).toHaveLength(2);
    });
  });

  describe('submit', () => {
    it('validates content against the submission type', async () => {
      assignments.findOne.mockResolvedValue(
        assignmentFixture({ submissionType: SubmissionType.FILE }),
      );
      await expect(service.submit(learner, 'l1', { text: 'hello' })).rejects.toThrow(
        'uploaded file',
      );

      assignments.findOne.mockResolvedValue(
        assignmentFixture({ submissionType: SubmissionType.TEXT }),
      );
      await expect(
        service.submit(learner, 'l1', { fileKey: 'k', fileUrl: 'https://f' }),
      ).rejects.toThrow('text answer');

      assignments.findOne.mockResolvedValue(assignmentFixture());
      await expect(service.submit(learner, 'l1', {})).rejects.toThrow('Provide a text answer');
    });

    it('creates a submission, marks the lesson in progress and notifies the instructor', async () => {
      const submission = await service.submit(learner, 'l1', { text: ' My essay ' });

      expect(submission).toMatchObject({
        assignmentId: 'as-1',
        userId: 'lea',
        enrollmentId: 'e1',
        attemptNumber: 1,
        text: 'My essay',
        status: SubmissionStatus.SUBMITTED,
      });
      expect(progressService.update).toHaveBeenCalledWith(learner, 'l1', {
        status: LessonProgressStatus.IN_PROGRESS,
      });
      expect(notificationsService.notify).toHaveBeenCalledWith(
        'ins',
        expect.objectContaining({ type: NotificationType.SUBMISSION_RECEIVED }),
      );
    });

    it('blocks resubmission while ungraded, after passing, or over the limit', async () => {
      submissions.find.mockResolvedValue([{ status: SubmissionStatus.SUBMITTED, score: null }]);
      await expect(service.submit(learner, 'l1', { text: 'x' })).rejects.toThrow(
        'waiting to be graded',
      );

      submissions.find.mockResolvedValue([{ status: SubmissionStatus.GRADED, score: 90 }]);
      await expect(service.submit(learner, 'l1', { text: 'x' })).rejects.toThrow('already passed');

      submissions.find.mockResolvedValue([
        { status: SubmissionStatus.RETURNED, score: 10 },
        { status: SubmissionStatus.RETURNED, score: 20 },
      ]);
      await expect(service.submit(learner, 'l1', { text: 'x' })).rejects.toBeInstanceOf(
        ConflictException,
      );

      assignments.findOne.mockResolvedValue(assignmentFixture({ allowResubmission: false }));
      submissions.find.mockResolvedValue([{ status: SubmissionStatus.GRADED, score: 10 }]);
      await expect(service.submit(learner, 'l1', { text: 'x' })).rejects.toThrow('does not allow');
    });
  });

  describe('grade', () => {
    beforeEach(() => {
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    });

    it('scores rubric assignments, completes the lesson on a pass and notifies the learner', async () => {
      const assignment = assignmentFixture({
        rubric: [
          { id: 'a', criterion: 'A', description: null, maxPoints: 60 },
          { id: 'b', criterion: 'B', description: null, maxPoints: 40 },
        ],
      });
      submissions.findOne.mockResolvedValue({
        id: 'sub-1',
        userId: 'lea',
        assignment,
        status: SubmissionStatus.SUBMITTED,
      });

      const graded = await service.grade(instructor, 'sub-1', {
        rubricScores: [
          { criterionId: 'a', points: 50, comment: 'good' },
          { criterionId: 'b', points: 20 },
        ],
        feedback: 'Well done',
      });

      expect(graded).toMatchObject({
        score: 70,
        status: SubmissionStatus.GRADED,
        gradedById: 'ins',
      });
      expect(progressService.update).toHaveBeenCalledWith(learner, 'l1', {
        status: LessonProgressStatus.COMPLETED,
      });
      expect(notificationsService.notify).toHaveBeenCalledWith(
        'lea',
        expect.objectContaining({ type: NotificationType.GRADE_POSTED }),
      );
      expect(mailService.sendGradePosted).toHaveBeenCalledWith(
        learner,
        'Essay',
        'TS',
        70,
        100,
        true,
        'https://app.test/courses/ts',
      );
    });

    it('returns failing work for another attempt without completing the lesson', async () => {
      submissions.findOne.mockResolvedValue({
        id: 'sub-1',
        userId: 'lea',
        assignment: assignmentFixture(),
      });

      const graded = await service.grade(instructor, 'sub-1', { score: 40, feedback: 'Try again' });

      expect(graded.status).toBe(SubmissionStatus.RETURNED);
      expect(progressService.update).not.toHaveBeenCalled();
    });

    it('validates rubric coverage, point caps and plain scores', async () => {
      const assignment = assignmentFixture({
        rubric: [{ id: 'a', criterion: 'A', description: null, maxPoints: 100 }],
      });
      submissions.findOne.mockResolvedValue({ id: 'sub-1', userId: 'lea', assignment });
      await expect(service.grade(instructor, 'sub-1', { rubricScores: [] })).rejects.toThrow(
        'Missing score',
      );
      await expect(
        service.grade(instructor, 'sub-1', { rubricScores: [{ criterionId: 'a', points: 150 }] }),
      ).rejects.toThrow('at most 100');

      submissions.findOne.mockResolvedValue({
        id: 'sub-1',
        userId: 'lea',
        assignment: assignmentFixture(),
      });
      await expect(service.grade(instructor, 'sub-1', {})).rejects.toThrow('score is required');
      await expect(service.grade(instructor, 'sub-1', { score: 101 })).rejects.toThrow(
        'cannot exceed',
      );
    });
  });

  it('keeps only the latest submission per learner and assignment', async () => {
    assignments.find.mockResolvedValue([{ id: 'as-1' }]);
    submissions.find.mockResolvedValue([
      { userId: 'u1', assignmentId: 'as-1', attemptNumber: 2, score: 80 },
      { userId: 'u1', assignmentId: 'as-1', attemptNumber: 1, score: 10 },
    ]);

    const latest = await service.latestSubmissionsForCourse('c1', ['u1']);

    expect(latest.get('u1')?.get('as-1')?.attemptNumber).toBe(2);
    await expect(service.latestSubmissionsForCourse('c1', [])).resolves.toEqual(new Map());
  });
});

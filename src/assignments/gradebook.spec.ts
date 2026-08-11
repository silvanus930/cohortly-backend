import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CohortsService } from '../cohorts/cohorts.service';
import { CohortMemberStatus } from '../cohorts/enums/cohort.enums';
import { UserRole } from '../common/enums/user-role.enum';
import { Enrollment } from '../enrollments/entities/enrollment.entity';
import { Quiz } from '../quizzes/entities/quiz.entity';
import { QuizzesService } from '../quizzes/quizzes.service';
import { type User } from '../users/entities/user.entity';
import { AssignmentsController, AssignmentsManageController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';
import { SubmissionStatus } from './enums/assignment.enums';
import { GradebookService } from './gradebook.service';

const instructor = { id: 'ins', role: UserRole.INSTRUCTOR } as User;

describe('GradebookService', () => {
  let service: GradebookService;
  const enrollments = { find: jest.fn().mockResolvedValue([]) };
  const quizzes = { find: jest.fn().mockResolvedValue([]) };
  const cohortsService = {
    findManaged: jest.fn().mockResolvedValue({ id: 'co', title: 'Spring', courseId: 'c1' }),
    roster: jest.fn().mockResolvedValue([]),
  };
  const quizzesService = { bestScoresForCourse: jest.fn().mockResolvedValue(new Map()) };
  const assignmentsService = {
    listForCourse: jest.fn().mockResolvedValue([]),
    latestSubmissionsForCourse: jest.fn().mockResolvedValue(new Map()),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        GradebookService,
        { provide: getRepositoryToken(Enrollment), useValue: enrollments },
        { provide: getRepositoryToken(Quiz), useValue: quizzes },
        { provide: CohortsService, useValue: cohortsService },
        { provide: QuizzesService, useValue: quizzesService },
        { provide: AssignmentsService, useValue: assignmentsService },
      ],
    }).compile();
    service = moduleRef.get(GradebookService);
  });

  it('builds ordered columns and per learner cells with averages', async () => {
    cohortsService.roster.mockResolvedValue([
      {
        userId: 'u1',
        status: CohortMemberStatus.ENROLLED,
        user: { id: 'u1', firstName: 'A', lastName: 'B', email: 'a@b.c' },
      },
      {
        userId: 'u2',
        status: CohortMemberStatus.DROPPED,
        user: { id: 'u2', firstName: 'X', lastName: 'Y', email: 'x@y.z' },
      },
    ]);
    assignmentsService.listForCourse.mockResolvedValue([
      {
        id: 'as-1',
        lessonId: 'l2',
        title: 'Essay',
        maxPoints: 50,
        passingPoints: 30,
        lesson: { position: 1 },
      },
    ]);
    quizzes.find.mockResolvedValue([
      { id: 'qz-1', lessonId: 'l1', title: 'Quiz', lesson: { position: 0 } },
    ]);
    enrollments.find.mockResolvedValue([{ userId: 'u1', progressPercent: 75 }]);
    assignmentsService.latestSubmissionsForCourse.mockResolvedValue(
      new Map([['u1', new Map([['as-1', { status: SubmissionStatus.GRADED, score: 40 }]])]]),
    );
    quizzesService.bestScoresForCourse.mockResolvedValue(
      new Map([['u1', new Map([['qz-1', { scorePercent: 90, passed: true }]])]]),
    );

    const gradebook = await service.forCohort(instructor, 'co');

    expect(gradebook.columns.map((c) => c.kind)).toEqual(['quiz', 'assignment']);
    expect(gradebook.rows).toHaveLength(1);
    expect(gradebook.rows[0]).toMatchObject({
      learner: { fullName: 'A B' },
      progressPercent: 75,
      averagePercent: 85,
    });
    expect(gradebook.rows[0].cells).toEqual([
      { columnId: 'qz-1', score: 90, maxPoints: 100, percent: 90, status: 'PASSED' },
      { columnId: 'as-1', score: 40, maxPoints: 50, percent: 80, status: 'PASSED' },
    ]);
  });

  it('marks missing, pending and returned work', async () => {
    quizzes.find.mockResolvedValue([]);
    quizzesService.bestScoresForCourse.mockResolvedValue(new Map());
    cohortsService.roster.mockResolvedValue([
      {
        userId: 'u1',
        status: CohortMemberStatus.ENROLLED,
        user: { id: 'u1', firstName: 'A', lastName: 'B', email: 'a@b.c' },
      },
    ]);
    assignmentsService.listForCourse.mockResolvedValue([
      {
        id: 'as-1',
        lessonId: 'l1',
        title: 'One',
        maxPoints: 10,
        passingPoints: 5,
        lesson: { position: 0 },
      },
      {
        id: 'as-2',
        lessonId: 'l2',
        title: 'Two',
        maxPoints: 10,
        passingPoints: 5,
        lesson: { position: 1 },
      },
      {
        id: 'as-3',
        lessonId: 'l3',
        title: 'Three',
        maxPoints: 10,
        passingPoints: 5,
        lesson: { position: 2 },
      },
    ]);
    assignmentsService.latestSubmissionsForCourse.mockResolvedValue(
      new Map([
        [
          'u1',
          new Map([
            ['as-2', { status: SubmissionStatus.SUBMITTED, score: null }],
            ['as-3', { status: SubmissionStatus.RETURNED, score: 2 }],
          ]),
        ],
      ]),
    );

    const gradebook = await service.forCohort(instructor, 'co');

    expect(gradebook.rows[0].cells.map((c) => c.status)).toEqual([
      'NOT_SUBMITTED',
      'SUBMITTED',
      'RETURNED',
    ]);
    expect(gradebook.rows[0].averagePercent).toBe(20);
  });
});

describe('assignment controllers', () => {
  const assignment = {
    id: 'as-1',
    lessonId: 'l1',
    courseId: 'c1',
    title: 'Essay',
    instructions: 'Write',
    submissionType: 'TEXT',
    maxPoints: 100,
    passingPoints: 60,
    rubric: [],
    allowResubmission: true,
    maxSubmissions: 3,
  };
  const submission = {
    id: 'sub-1',
    assignmentId: 'as-1',
    attemptNumber: 1,
    text: 'hi',
    fileUrl: null,
    status: SubmissionStatus.SUBMITTED,
    score: null,
    rubricScores: [],
    feedback: null,
    gradedAt: null,
    submittedAt: new Date(),
    user: { id: 'lea', firstName: 'Lea', lastName: 'R', email: 'lea@x.test', avatarUrl: null },
  };
  const assignmentsService = {
    upsert: jest.fn().mockResolvedValue(assignment),
    findForManage: jest.fn().mockResolvedValue(assignment),
    remove: jest.fn(),
    listSubmissions: jest.fn().mockResolvedValue({ items: [submission], meta: { total: 1 } }),
    grade: jest
      .fn()
      .mockResolvedValue({ ...submission, score: 80, status: SubmissionStatus.GRADED }),
    viewForLearner: jest.fn().mockResolvedValue({
      assignment,
      submissions: [submission],
      canSubmit: false,
      reason: 'waiting',
    }),
    presignUpload: jest.fn().mockResolvedValue({ key: 'k' }),
    submit: jest.fn().mockResolvedValue(submission),
    mySubmissions: jest.fn().mockResolvedValue([submission]),
  };
  const gradebookService = { forCohort: jest.fn().mockResolvedValue({ columns: [], rows: [] }) };

  it('exposes learner details to managers only', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AssignmentsManageController, AssignmentsController],
      providers: [
        { provide: AssignmentsService, useValue: assignmentsService },
        { provide: GradebookService, useValue: gradebookService },
      ],
    }).compile();
    const manage = moduleRef.get(AssignmentsManageController);
    const controller = moduleRef.get(AssignmentsController);

    const page = await manage.submissions(instructor, 'l1', { page: 1, limit: 10 });
    expect(page.items[0].learner?.email).toBe('lea@x.test');

    const graded = await manage.grade(instructor, 'sub-1', { score: 80 });
    expect(graded.score).toBe(80);
    expect(graded).not.toHaveProperty('learner');

    const view = await controller.view(instructor, 'l1');
    expect(view).toMatchObject({ canSubmit: false, reason: 'waiting' });
    expect(view.submissions[0]).not.toHaveProperty('learner');

    await manage.gradebook(instructor, 'co');
    expect(gradebookService.forCohort).toHaveBeenCalledWith(instructor, 'co');
  });
});

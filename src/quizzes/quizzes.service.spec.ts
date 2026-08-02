import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserRole } from '../common/enums/user-role.enum';
import { CoursesService } from '../courses/courses.service';
import { CurriculumService } from '../courses/curriculum.service';
import { Lesson } from '../courses/entities/lesson.entity';
import { LessonType } from '../courses/enums/course.enums';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { LessonProgressStatus } from '../enrollments/enums/enrollment.enums';
import { ProgressService } from '../enrollments/progress.service';
import { type User } from '../users/entities/user.entity';
import { type UpsertQuizDto } from './dto/quiz.dto';
import { QuizAttempt } from './entities/quiz-attempt.entity';
import { Quiz } from './entities/quiz.entity';
import { gradeAnswers, QuizzesService, validateQuestions } from './quizzes.service';

const instructor = { id: 'ins', role: UserRole.INSTRUCTOR } as User;
const learner = { id: 'lea', role: UserRole.LEARNER } as User;

const questions: UpsertQuizDto['questions'] = [
  {
    id: 'q1',
    prompt: 'Pick one',
    type: 'SINGLE',
    options: [
      { id: 'a', text: 'A' },
      { id: 'b', text: 'B' },
    ],
    correctOptionIds: ['a'],
    points: 2,
  },
  {
    id: 'q2',
    prompt: 'Pick many',
    type: 'MULTIPLE',
    options: [
      { id: 'x', text: 'X' },
      { id: 'y', text: 'Y' },
      { id: 'z', text: 'Z' },
    ],
    correctOptionIds: ['x', 'y'],
  },
];

describe('quiz helpers', () => {
  it('normalises valid questions and defaults points', () => {
    const result = validateQuestions(questions);

    expect(result[1].points).toBe(1);
    expect(result[0].explanation).toBeNull();
  });

  it('rejects duplicate ids, unknown correct options and wrong cardinalities', () => {
    expect(() => validateQuestions([questions[0], { ...questions[1], id: 'q1' }])).toThrow(
      'Duplicate question id',
    );
    expect(() => validateQuestions([{ ...questions[0], correctOptionIds: ['nope'] }])).toThrow(
      'unknown options',
    );
    expect(() => validateQuestions([{ ...questions[0], correctOptionIds: ['a', 'b'] }])).toThrow(
      'exactly one correct option',
    );
    expect(() =>
      validateQuestions([
        {
          ...questions[1],
          type: 'TRUE_FALSE',
          correctOptionIds: ['x'],
        },
      ]),
    ).toThrow('exactly two options');
  });

  it('grades answers with all or nothing per question', () => {
    const normalised = validateQuestions(questions);

    const graded = gradeAnswers(normalised, [
      { questionId: 'q1', selectedOptionIds: ['a'] },
      { questionId: 'q2', selectedOptionIds: ['x'] },
    ]);

    expect(graded.pointsEarned).toBe(2);
    expect(graded.pointsTotal).toBe(3);
    expect(graded.results[1]).toMatchObject({ correct: false, correctOptionIds: ['x', 'y'] });
  });
});

describe('QuizzesService', () => {
  let service: QuizzesService;
  const quizzes = {
    findOne: jest.fn(),
    create: jest.fn((value: object) => value),
    save: jest.fn((value: object) => Promise.resolve({ id: 'quiz-1', ...value })),
    remove: jest.fn(),
  };
  const attempts = {
    find: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    exists: jest.fn().mockResolvedValue(false),
    create: jest.fn((value: object) => value),
    save: jest.fn((value: object) => Promise.resolve({ id: 'att-1', ...value })),
    createQueryBuilder: jest.fn(),
  };
  const lessons = { findOne: jest.fn() };
  const coursesService = { findByIdOrFail: jest.fn() };
  const curriculumService = {
    findLessonForManage: jest.fn(),
    listModules: jest.fn().mockResolvedValue([]),
  };
  const enrollmentsService = { requireAccessible: jest.fn().mockResolvedValue({ id: 'e1' }) };
  const progressService = { update: jest.fn().mockResolvedValue({}) };
  const storedQuiz = (): Quiz =>
    ({
      id: 'quiz-1',
      lessonId: 'l1',
      courseId: 'c1',
      title: 'Checkpoint',
      questions: validateQuestions(questions),
      passingScore: 70,
      maxAttempts: 2,
    }) as Quiz;

  beforeEach(async () => {
    jest.clearAllMocks();
    attempts.find.mockResolvedValue([]);
    attempts.count.mockResolvedValue(0);
    attempts.exists.mockResolvedValue(false);
    curriculumService.listModules.mockResolvedValue([]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        QuizzesService,
        { provide: getRepositoryToken(Quiz), useValue: quizzes },
        { provide: getRepositoryToken(QuizAttempt), useValue: attempts },
        { provide: getRepositoryToken(Lesson), useValue: lessons },
        { provide: CoursesService, useValue: coursesService },
        { provide: CurriculumService, useValue: curriculumService },
        { provide: EnrollmentsService, useValue: enrollmentsService },
        { provide: ProgressService, useValue: progressService },
      ],
    }).compile();
    service = moduleRef.get(QuizzesService);
  });

  it('only attaches quizzes to QUIZ lessons', async () => {
    curriculumService.findLessonForManage.mockResolvedValue({ id: 'l1', type: LessonType.VIDEO });

    await expect(
      service.upsert(instructor, 'l1', { title: 'Q', questions }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates and replaces quizzes with defaults', async () => {
    curriculumService.findLessonForManage.mockResolvedValue({
      id: 'l1',
      courseId: 'c1',
      type: LessonType.QUIZ,
    });
    quizzes.findOne.mockResolvedValue(null);

    const quiz = await service.upsert(instructor, 'l1', { title: ' Checkpoint ', questions });

    expect(quiz).toMatchObject({
      lessonId: 'l1',
      courseId: 'c1',
      title: 'Checkpoint',
      passingScore: 70,
      maxAttempts: 3,
    });
    expect(quiz.questions).toHaveLength(2);
  });

  it('hides answers from learners and reports the attempt budget', async () => {
    quizzes.findOne.mockResolvedValue(storedQuiz());
    attempts.find.mockResolvedValue([{ scorePercent: 33, passed: false }]);

    const view = await service.viewForLearner(learner, 'l1');

    expect(view.questions[0]).not.toHaveProperty('correctOptionIds');
    expect(view).toMatchObject({ attemptsUsed: 1, attemptsLeft: 1, bestScore: 33, passed: false });
  });

  it('grades submissions, enforces the attempt limit and completes the lesson on a pass', async () => {
    quizzes.findOne.mockResolvedValue(storedQuiz());

    const failed = await service.submit(learner, 'l1', {
      answers: [{ questionId: 'q1', selectedOptionIds: ['b'] }],
    });
    expect(failed.attempt).toMatchObject({ scorePercent: 0, passed: false, attemptNumber: 1 });
    expect(progressService.update).toHaveBeenLastCalledWith(learner, 'l1', {
      status: LessonProgressStatus.IN_PROGRESS,
    });

    attempts.count.mockResolvedValue(1);
    const passed = await service.submit(learner, 'l1', {
      answers: [
        { questionId: 'q1', selectedOptionIds: ['a'] },
        { questionId: 'q2', selectedOptionIds: ['y', 'x'] },
      ],
    });
    expect(passed.attempt).toMatchObject({ scorePercent: 100, passed: true, attemptNumber: 2 });
    expect(progressService.update).toHaveBeenLastCalledWith(learner, 'l1', {
      status: LessonProgressStatus.COMPLETED,
    });

    attempts.count.mockResolvedValue(2);
    await expect(service.submit(learner, 'l1', { answers: [] })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects answers for unknown questions and missing quizzes', async () => {
    quizzes.findOne.mockResolvedValueOnce(storedQuiz());
    await expect(
      service.submit(learner, 'l1', { answers: [{ questionId: 'zzz', selectedOptionIds: [] }] }),
    ).rejects.toBeInstanceOf(BadRequestException);

    quizzes.findOne.mockResolvedValueOnce(null);
    await expect(service.viewForLearner(learner, 'l1')).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('lesson gate', () => {
    const quizLesson = { id: 'l1', courseId: 'c1', type: LessonType.QUIZ, position: 0 } as Lesson;
    const nextLesson = {
      id: 'l2',
      courseId: 'c1',
      type: LessonType.READING,
      position: 1,
    } as Lesson;

    beforeEach(() => {
      curriculumService.listModules.mockResolvedValue([
        { id: 'm1', lessons: [quizLesson, nextLesson] },
      ]);
    });

    it('blocks completing a quiz lesson until the quiz is passed', async () => {
      quizzes.findOne.mockResolvedValue(storedQuiz());
      attempts.exists.mockResolvedValue(false);
      await expect(service.assertQuizGate(learner, quizLesson)).rejects.toThrow('to complete');

      attempts.exists.mockResolvedValue(true);
      await expect(service.assertQuizGate(learner, quizLesson)).resolves.toBeUndefined();
    });

    it('locks the lesson after a quiz until it is passed', async () => {
      quizzes.findOne.mockResolvedValue(storedQuiz());
      attempts.exists.mockResolvedValue(false);
      await expect(service.assertQuizGate(learner, nextLesson)).rejects.toThrow('before moving on');
    });

    it('ignores lessons that are not near a quiz', async () => {
      curriculumService.listModules.mockResolvedValue([{ id: 'm1', lessons: [nextLesson] }]);

      await expect(service.assertQuizGate(learner, nextLesson)).resolves.toBeUndefined();
      expect(quizzes.findOne).not.toHaveBeenCalled();
    });
  });

  it('keeps the best attempt per learner and quiz for gradebooks', async () => {
    attempts.createQueryBuilder.mockReturnValue({
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        { userId: 'u1', quizId: 'qz', scorePercent: 40 },
        { userId: 'u1', quizId: 'qz', scorePercent: 90 },
        { userId: 'u2', quizId: 'qz', scorePercent: 10 },
      ]),
    });

    const best = await service.bestScoresForCourse('c1');

    expect(best.get('u1')?.get('qz')?.scorePercent).toBe(90);
    expect(best.get('u2')?.get('qz')?.scorePercent).toBe(10);
  });
});

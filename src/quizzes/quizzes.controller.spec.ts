import { Test } from '@nestjs/testing';
import { UserRole } from '../common/enums/user-role.enum';
import { type User } from '../users/entities/user.entity';
import { QuizzesController, QuizzesManageController } from './quizzes.controller';
import { QuizzesService } from './quizzes.service';

const instructor = { id: 'ins', role: UserRole.INSTRUCTOR } as User;
const learner = { id: 'lea', role: UserRole.LEARNER } as User;
const quiz = {
  id: 'quiz-1',
  lessonId: 'l1',
  title: 'Checkpoint',
  description: null,
  passingScore: 70,
  maxAttempts: 3,
  timeLimitMinutes: null,
  shuffleQuestions: false,
  questions: [
    {
      id: 'q1',
      prompt: 'P',
      type: 'SINGLE',
      options: [{ id: 'a', text: 'A' }],
      correctOptionIds: ['a'],
      points: 2,
      explanation: null,
    },
  ],
};
const attempt = {
  id: 'att-1',
  attemptNumber: 1,
  pointsEarned: 2,
  pointsTotal: 2,
  scorePercent: 100,
  passed: true,
  submittedAt: new Date(),
};

describe('quiz controllers', () => {
  const quizzesService = {
    upsert: jest.fn().mockResolvedValue(quiz),
    findForManage: jest.fn().mockResolvedValue(quiz),
    remove: jest.fn(),
    viewForLearner: jest.fn().mockResolvedValue({
      quiz,
      questions: [{ id: 'q1', prompt: 'P', type: 'SINGLE', options: [], points: 2 }],
      attemptsUsed: 0,
      attemptsLeft: 3,
      bestScore: null,
      passed: false,
    }),
    submit: jest
      .fn()
      .mockResolvedValue({ attempt, results: [{ questionId: 'q1', correct: true }] }),
    listAttempts: jest.fn().mockResolvedValue([attempt]),
  };
  let manage: QuizzesManageController;
  let controller: QuizzesController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [QuizzesManageController, QuizzesController],
      providers: [{ provide: QuizzesService, useValue: quizzesService }],
    }).compile();
    manage = moduleRef.get(QuizzesManageController);
    controller = moduleRef.get(QuizzesController);
  });

  it('exposes answers to authors only', async () => {
    const authored = await manage.findOne(instructor, 'l1');
    expect(authored.questions[0]).toHaveProperty('correctOptionIds');
    expect(authored.totalPoints).toBe(2);

    const view = await controller.view(learner, 'l1');
    expect(view.questions[0]).not.toHaveProperty('correctOptionIds');
    expect(view.attemptsLeft).toBe(3);
  });

  it('upserts, removes, submits and lists attempts through the service', async () => {
    const dto = { title: 'Checkpoint', questions: [] };
    await manage.upsert(instructor, 'l1', dto);
    expect(quizzesService.upsert).toHaveBeenCalledWith(instructor, 'l1', dto);

    await manage.remove(instructor, 'l1');
    expect(quizzesService.remove).toHaveBeenCalledWith(instructor, 'l1');

    const submitted = await controller.submit(learner, 'l1', { answers: [] });
    expect(submitted).toMatchObject({ scorePercent: 100, passed: true });
    expect(submitted.results).toHaveLength(1);

    const attempts = await controller.attempts(learner, 'l1');
    expect(attempts[0]).not.toHaveProperty('results');
  });
});

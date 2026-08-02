import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CoursesService } from '../courses/courses.service';
import { CurriculumService } from '../courses/curriculum.service';
import { Lesson } from '../courses/entities/lesson.entity';
import { LessonType } from '../courses/enums/course.enums';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { LessonProgressStatus } from '../enrollments/enums/enrollment.enums';
import { ProgressService } from '../enrollments/progress.service';
import { type User } from '../users/entities/user.entity';
import { SubmitQuizAttemptDto, UpsertQuizDto } from './dto/quiz.dto';
import { QuizAttempt, type QuizAnswerResult } from './entities/quiz-attempt.entity';
import { Quiz, type QuizQuestion } from './entities/quiz.entity';

export interface PublicQuizQuestion {
  id: string;
  prompt: string;
  type: QuizQuestion['type'];
  options: { id: string; text: string }[];
  points: number;
}

export interface LearnerQuizView {
  quiz: Quiz;
  questions: PublicQuizQuestion[];
  attemptsUsed: number;
  attemptsLeft: number | null;
  bestScore: number | null;
  passed: boolean;
}

export interface GradedQuestion extends QuizAnswerResult {
  correctOptionIds: string[];
  explanation: string | null;
}

function sameSet(a: string[], b: string[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((value) => right.has(value));
}

/** Validates question structure beyond what class-validator can express. */
export function validateQuestions(questions: UpsertQuizDto['questions']): QuizQuestion[] {
  const ids = new Set<string>();
  return questions.map((question) => {
    if (ids.has(question.id)) {
      throw new BadRequestException(`Duplicate question id "${question.id}"`);
    }
    ids.add(question.id);
    const optionIds = new Set<string>();
    for (const option of question.options) {
      if (optionIds.has(option.id)) {
        throw new BadRequestException(
          `Duplicate option id "${option.id}" in question "${question.id}"`,
        );
      }
      optionIds.add(option.id);
    }
    const unknown = question.correctOptionIds.filter((id) => !optionIds.has(id));
    if (unknown.length > 0) {
      throw new BadRequestException(
        `Question "${question.id}" marks unknown options as correct: ${unknown.join(', ')}`,
      );
    }
    if (question.type !== 'MULTIPLE' && question.correctOptionIds.length !== 1) {
      throw new BadRequestException(
        `Question "${question.id}" must have exactly one correct option`,
      );
    }
    if (question.type === 'TRUE_FALSE' && question.options.length !== 2) {
      throw new BadRequestException(`Question "${question.id}" must offer exactly two options`);
    }
    return {
      id: question.id,
      prompt: question.prompt.trim(),
      type: question.type,
      options: question.options.map((option) => ({ id: option.id, text: option.text.trim() })),
      correctOptionIds: [...question.correctOptionIds],
      points: question.points ?? 1,
      explanation: question.explanation?.trim() || null,
    };
  });
}

export function gradeAnswers(
  questions: QuizQuestion[],
  answers: SubmitQuizAttemptDto['answers'],
): { results: GradedQuestion[]; pointsEarned: number; pointsTotal: number } {
  const byQuestion = new Map(
    answers.map((answer) => [answer.questionId, answer.selectedOptionIds]),
  );
  let pointsEarned = 0;
  let pointsTotal = 0;
  const results = questions.map((question) => {
    const selected = byQuestion.get(question.id) ?? [];
    const correct = sameSet(selected, question.correctOptionIds);
    const earned = correct ? question.points : 0;
    pointsEarned += earned;
    pointsTotal += question.points;
    return {
      questionId: question.id,
      selectedOptionIds: selected,
      correct,
      pointsEarned: earned,
      pointsPossible: question.points,
      correctOptionIds: question.correctOptionIds,
      explanation: question.explanation,
    };
  });
  return { results, pointsEarned, pointsTotal };
}

@Injectable()
export class QuizzesService {
  constructor(
    @InjectRepository(Quiz) private readonly quizzes: Repository<Quiz>,
    @InjectRepository(QuizAttempt) private readonly attempts: Repository<QuizAttempt>,
    @InjectRepository(Lesson) private readonly lessons: Repository<Lesson>,
    private readonly coursesService: CoursesService,
    private readonly curriculumService: CurriculumService,
    private readonly enrollmentsService: EnrollmentsService,
    private readonly progressService: ProgressService,
  ) {}

  async upsert(actor: User, lessonId: string, dto: UpsertQuizDto): Promise<Quiz> {
    const lesson = await this.curriculumService.findLessonForManage(actor, lessonId);
    if (lesson.type !== LessonType.QUIZ) {
      throw new BadRequestException('Quizzes can only be attached to lessons of type QUIZ');
    }
    const questions = validateQuestions(dto.questions);
    const quiz =
      (await this.quizzes.findOne({ where: { lessonId } })) ??
      this.quizzes.create({ lessonId, courseId: lesson.courseId });
    quiz.title = dto.title.trim();
    quiz.description = dto.description ?? null;
    quiz.questions = questions;
    quiz.passingScore = dto.passingScore ?? 70;
    quiz.maxAttempts = dto.maxAttempts ?? 3;
    quiz.timeLimitMinutes = dto.timeLimitMinutes ?? null;
    quiz.shuffleQuestions = dto.shuffleQuestions ?? false;
    return this.quizzes.save(quiz);
  }

  async findForManage(actor: User, lessonId: string): Promise<Quiz> {
    await this.curriculumService.findLessonForManage(actor, lessonId);
    return this.findByLessonOrFail(lessonId);
  }

  async remove(actor: User, lessonId: string): Promise<void> {
    await this.curriculumService.findLessonForManage(actor, lessonId);
    const quiz = await this.findByLessonOrFail(lessonId);
    await this.quizzes.remove(quiz);
  }

  async findByLesson(lessonId: string): Promise<Quiz | null> {
    return this.quizzes.findOne({ where: { lessonId } });
  }

  async findByLessonOrFail(lessonId: string): Promise<Quiz> {
    const quiz = await this.findByLesson(lessonId);
    if (!quiz) {
      throw new NotFoundException('This lesson has no quiz');
    }
    return quiz;
  }

  /** The quiz as a learner sees it: no answers, plus their attempt budget. */
  async viewForLearner(user: User, lessonId: string): Promise<LearnerQuizView> {
    const quiz = await this.findByLessonOrFail(lessonId);
    await this.enrollmentsService.requireAccessible(user.id, quiz.courseId);
    const attempts = await this.attempts.find({
      where: { quizId: quiz.id, userId: user.id },
      order: { attemptNumber: 'DESC' },
    });
    const bestScore = attempts.reduce<number | null>(
      (best, attempt) =>
        best === null || attempt.scorePercent > best ? attempt.scorePercent : best,
      null,
    );
    return {
      quiz,
      questions: quiz.questions.map((question) => ({
        id: question.id,
        prompt: question.prompt,
        type: question.type,
        options: question.options,
        points: question.points,
      })),
      attemptsUsed: attempts.length,
      attemptsLeft: quiz.maxAttempts === 0 ? null : Math.max(0, quiz.maxAttempts - attempts.length),
      bestScore,
      passed: attempts.some((attempt) => attempt.passed),
    };
  }

  async submit(
    user: User,
    lessonId: string,
    dto: SubmitQuizAttemptDto,
  ): Promise<{ attempt: QuizAttempt; results: GradedQuestion[] }> {
    const quiz = await this.findByLessonOrFail(lessonId);
    const enrollment = await this.enrollmentsService.requireAccessible(user.id, quiz.courseId);
    const used = await this.attempts.count({ where: { quizId: quiz.id, userId: user.id } });
    if (quiz.maxAttempts > 0 && used >= quiz.maxAttempts) {
      throw new ForbiddenException('You have used every attempt for this quiz');
    }
    const knownQuestions = new Set(quiz.questions.map((question) => question.id));
    const unknown = dto.answers.filter((answer) => !knownQuestions.has(answer.questionId));
    if (unknown.length > 0) {
      throw new BadRequestException(
        `Unknown questions: ${unknown.map((answer) => answer.questionId).join(', ')}`,
      );
    }

    const graded = gradeAnswers(quiz.questions, dto.answers);
    const scorePercent =
      graded.pointsTotal === 0 ? 0 : Math.round((graded.pointsEarned / graded.pointsTotal) * 100);
    const passed = scorePercent >= quiz.passingScore;
    const attempt = await this.attempts.save(
      this.attempts.create({
        quizId: quiz.id,
        userId: user.id,
        enrollmentId: enrollment.id,
        attemptNumber: used + 1,
        answers: graded.results.map(({ correctOptionIds: _c, explanation: _e, ...rest }) => rest),
        pointsEarned: graded.pointsEarned,
        pointsTotal: graded.pointsTotal,
        scorePercent,
        passed,
        submittedAt: new Date(),
      }),
    );
    if (passed) {
      await this.progressService.update(user, lessonId, {
        status: LessonProgressStatus.COMPLETED,
      });
    } else {
      await this.progressService.update(user, lessonId, {
        status: LessonProgressStatus.IN_PROGRESS,
      });
    }
    return { attempt, results: graded.results };
  }

  async listAttempts(user: User, lessonId: string): Promise<QuizAttempt[]> {
    const quiz = await this.findByLessonOrFail(lessonId);
    return this.attempts.find({
      where: { quizId: quiz.id, userId: user.id },
      order: { attemptNumber: 'ASC' },
    });
  }

  async hasPassed(quizId: string, userId: string): Promise<boolean> {
    return this.attempts.exists({ where: { quizId, userId, passed: true } });
  }

  /** Best score per learner for a course, used by the gradebook. */
  async bestScoresForCourse(courseId: string): Promise<Map<string, Map<string, QuizAttempt>>> {
    const attempts = await this.attempts
      .createQueryBuilder('attempt')
      .innerJoinAndSelect('attempt.quiz', 'quiz')
      .where('quiz.courseId = :courseId', { courseId })
      .getMany();
    const byUser = new Map<string, Map<string, QuizAttempt>>();
    for (const attempt of attempts) {
      const perQuiz = byUser.get(attempt.userId) ?? new Map<string, QuizAttempt>();
      const current = perQuiz.get(attempt.quizId);
      if (!current || attempt.scorePercent > current.scorePercent) {
        perQuiz.set(attempt.quizId, attempt);
      }
      byUser.set(attempt.userId, perQuiz);
    }
    return byUser;
  }

  /**
   * Lesson gate: a quiz lesson completes only by passing its quiz, and the
   * lesson after a quiz stays locked until that quiz is passed.
   */
  async assertQuizGate(user: User, lesson: Lesson): Promise<void> {
    if (lesson.type === LessonType.QUIZ) {
      const quiz = await this.findByLesson(lesson.id);
      if (quiz && !(await this.hasPassed(quiz.id, user.id))) {
        throw new ForbiddenException(`Pass the quiz "${quiz.title}" to complete this lesson`);
      }
    }
    const previous = await this.previousLesson(lesson);
    if (previous?.type === LessonType.QUIZ) {
      const quiz = await this.findByLesson(previous.id);
      if (quiz && !(await this.hasPassed(quiz.id, user.id))) {
        throw new ForbiddenException(`Pass the quiz "${quiz.title}" before moving on`);
      }
    }
  }

  private async previousLesson(lesson: Lesson): Promise<Lesson | null> {
    const modules = await this.curriculumService.listModules(lesson.courseId);
    const ordered = modules.flatMap((module) =>
      [...(module.lessons ?? [])].sort((a, b) => a.position - b.position),
    );
    const index = ordered.findIndex((item) => item.id === lesson.id);
    return index > 0 ? ordered[index - 1] : null;
  }

  async courseOf(lessonId: string): Promise<Lesson> {
    const lesson = await this.lessons.findOne({ where: { id: lessonId } });
    if (!lesson) {
      throw new NotFoundException(`Lesson ${lessonId} was not found`);
    }
    await this.coursesService.findByIdOrFail(lesson.courseId, []);
    return lesson;
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { type User } from '../users/entities/user.entity';
import { SubmitQuizAttemptDto, UpsertQuizDto } from './dto/quiz.dto';
import { type QuizAttempt } from './entities/quiz-attempt.entity';
import { type Quiz, type QuizQuestion } from './entities/quiz.entity';
import { type GradedQuestion, type PublicQuizQuestion, QuizzesService } from './quizzes.service';

export interface QuizDto {
  id: string;
  lessonId: string;
  title: string;
  description: string | null;
  passingScore: number;
  maxAttempts: number;
  timeLimitMinutes: number | null;
  shuffleQuestions: boolean;
  totalPoints: number;
}

export interface QuizAuthoringDto extends QuizDto {
  questions: QuizQuestion[];
}

export interface LearnerQuizDto extends QuizDto {
  questions: PublicQuizQuestion[];
  attemptsUsed: number;
  attemptsLeft: number | null;
  bestScore: number | null;
  passed: boolean;
}

export interface QuizAttemptDto {
  id: string;
  attemptNumber: number;
  pointsEarned: number;
  pointsTotal: number;
  scorePercent: number;
  passed: boolean;
  submittedAt: Date;
  results?: GradedQuestion[];
}

function baseQuizDto(quiz: Quiz): QuizDto {
  return {
    id: quiz.id,
    lessonId: quiz.lessonId,
    title: quiz.title,
    description: quiz.description,
    passingScore: quiz.passingScore,
    maxAttempts: quiz.maxAttempts,
    timeLimitMinutes: quiz.timeLimitMinutes,
    shuffleQuestions: quiz.shuffleQuestions,
    totalPoints: quiz.questions.reduce((sum, question) => sum + question.points, 0),
  };
}

export function toQuizAttemptDto(attempt: QuizAttempt, results?: GradedQuestion[]): QuizAttemptDto {
  const dto: QuizAttemptDto = {
    id: attempt.id,
    attemptNumber: attempt.attemptNumber,
    pointsEarned: attempt.pointsEarned,
    pointsTotal: attempt.pointsTotal,
    scorePercent: attempt.scorePercent,
    passed: attempt.passed,
    submittedAt: attempt.submittedAt,
  };
  if (results) {
    dto.results = results;
  }
  return dto;
}

@ApiTags('quizzes')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.INSTRUCTOR)
@Controller('manage/lessons/:lessonId/quiz')
export class QuizzesManageController {
  constructor(private readonly quizzesService: QuizzesService) {}

  @Put()
  @ApiOperation({ summary: 'Create or replace the quiz of a QUIZ lesson' })
  async upsert(
    @CurrentUser() actor: User,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Body() dto: UpsertQuizDto,
  ): Promise<QuizAuthoringDto> {
    const quiz = await this.quizzesService.upsert(actor, lessonId, dto);
    return { ...baseQuizDto(quiz), questions: quiz.questions };
  }

  @Get()
  async findOne(
    @CurrentUser() actor: User,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
  ): Promise<QuizAuthoringDto> {
    const quiz = await this.quizzesService.findForManage(actor, lessonId);
    return { ...baseQuizDto(quiz), questions: quiz.questions };
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() actor: User,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
  ): Promise<void> {
    return this.quizzesService.remove(actor, lessonId);
  }
}

@ApiTags('quizzes')
@ApiBearerAuth()
@Controller('quizzes/lessons/:lessonId')
export class QuizzesController {
  constructor(private readonly quizzesService: QuizzesService) {}

  @Get()
  @ApiOperation({ summary: 'The quiz without answers plus your attempt budget' })
  async view(
    @CurrentUser() user: User,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
  ): Promise<LearnerQuizDto> {
    const view = await this.quizzesService.viewForLearner(user, lessonId);
    return {
      ...baseQuizDto(view.quiz),
      questions: view.questions,
      attemptsUsed: view.attemptsUsed,
      attemptsLeft: view.attemptsLeft,
      bestScore: view.bestScore,
      passed: view.passed,
    };
  }

  @Post('attempts')
  @ApiOperation({ summary: 'Submit answers; the attempt is graded immediately' })
  async submit(
    @CurrentUser() user: User,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Body() dto: SubmitQuizAttemptDto,
  ): Promise<QuizAttemptDto> {
    const { attempt, results } = await this.quizzesService.submit(user, lessonId, dto);
    return toQuizAttemptDto(attempt, results);
  }

  @Get('attempts')
  async attempts(
    @CurrentUser() user: User,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
  ): Promise<QuizAttemptDto[]> {
    const attempts = await this.quizzesService.listAttempts(user, lessonId);
    return attempts.map((attempt) => toQuizAttemptDto(attempt));
  }
}

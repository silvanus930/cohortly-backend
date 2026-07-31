import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { type Paginated } from '../common/pagination/pagination';
import { type User } from '../users/entities/user.entity';
import {
  EnrollDto,
  ListCourseEnrollmentsQueryDto,
  ListMyEnrollmentsQueryDto,
  UpdateLessonProgressDto,
} from './dto/enrollment.dto';
import {
  type EnrollmentDto,
  type LessonProgressDto,
  toEnrollmentDto,
  toLessonProgressDto,
} from './enrollments.mapper';
import { EnrollmentsService } from './enrollments.service';
import {
  type LessonOutlineItem,
  type ModuleOutline,
  ProgressService,
  type StreakSummary,
} from './progress.service';

export interface CourseProgressDto {
  enrollment: EnrollmentDto;
  modules: ModuleOutline[];
  nextLesson: LessonOutlineItem | null;
}

export interface ContinueLearningDto {
  enrollment: EnrollmentDto;
  nextLesson: LessonOutlineItem | null;
}

@ApiTags('enrollments')
@ApiBearerAuth()
@Controller('enrollments')
export class EnrollmentsController {
  constructor(
    private readonly enrollmentsService: EnrollmentsService,
    private readonly progressService: ProgressService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Enroll in a free course, or a paid one through an organization seat' })
  async enroll(@CurrentUser() user: User, @Body() dto: EnrollDto): Promise<EnrollmentDto> {
    return toEnrollmentDto(await this.enrollmentsService.enroll(user, dto));
  }

  @Get('mine')
  @ApiOperation({
    summary: 'Your enrollments. Filter by status for in progress or completed lists.',
  })
  async mine(
    @CurrentUser() user: User,
    @Query() query: ListMyEnrollmentsQueryDto,
  ): Promise<Paginated<EnrollmentDto>> {
    const page = await this.enrollmentsService.listMine(user, query);
    return { items: page.items.map((item) => toEnrollmentDto(item)), meta: page.meta };
  }

  @Get('continue')
  @ApiOperation({ summary: 'The course you touched most recently and its next lesson' })
  async continueLearning(@CurrentUser() user: User): Promise<ContinueLearningDto | null> {
    const enrollment = await this.enrollmentsService.mostRecentActive(user);
    if (!enrollment) {
      return null;
    }
    const nextLesson = await this.progressService.nextLesson(enrollment);
    return { enrollment: toEnrollmentDto(enrollment), nextLesson };
  }

  @Get('streak')
  streak(@CurrentUser('id') userId: string): Promise<StreakSummary> {
    return this.progressService.streak(userId);
  }

  @Get('courses/:courseId/progress')
  @ApiOperation({ summary: 'Full outline of a course with your per lesson status' })
  async courseProgress(
    @CurrentUser() user: User,
    @Param('courseId', ParseUUIDPipe) courseId: string,
  ): Promise<CourseProgressDto> {
    const result = await this.progressService.courseProgress(user, courseId);
    return {
      enrollment: toEnrollmentDto(result.enrollment),
      modules: result.modules,
      nextLesson: result.nextLesson,
    };
  }

  @Put('lessons/:lessonId/progress')
  @ApiOperation({
    summary: 'Record progress on a lesson; completing the last lesson completes the course',
  })
  async updateProgress(
    @CurrentUser() user: User,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Body() dto: UpdateLessonProgressDto,
  ): Promise<{ progress: LessonProgressDto; enrollment: EnrollmentDto }> {
    const result = await this.progressService.update(user, lessonId, dto);
    return {
      progress: toLessonProgressDto(result.progress),
      enrollment: toEnrollmentDto(result.enrollment),
    };
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<EnrollmentDto> {
    return toEnrollmentDto(await this.enrollmentsService.cancel(user, id));
  }
}

@ApiTags('enrollments')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.INSTRUCTOR)
@Controller('manage')
export class EnrollmentsManageController {
  constructor(private readonly enrollmentsService: EnrollmentsService) {}

  @Get('courses/:courseId/enrollments')
  @ApiOperation({ summary: 'Learners enrolled in a course with their progress' })
  async listForCourse(
    @CurrentUser() actor: User,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Query() query: ListCourseEnrollmentsQueryDto,
  ): Promise<Paginated<EnrollmentDto>> {
    const page = await this.enrollmentsService.listForCourse(actor, courseId, query);
    return { items: page.items.map((item) => toEnrollmentDto(item, true)), meta: page.meta };
  }
}

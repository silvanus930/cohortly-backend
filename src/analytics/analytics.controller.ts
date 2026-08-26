import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { type User } from '../users/entities/user.entity';
import {
  AnalyticsService,
  type CohortCompletion,
  type EnrollmentPoint,
  type PlatformOverview,
  type RevenuePoint,
  type TopCourse,
} from './analytics.service';
import {
  AnalyticsRangeQueryDto,
  ResetPerformanceDto,
  TopCoursesQueryDto,
} from './dto/analytics.dto';
import {
  type InstructorPerformance,
  InstructorPerformanceService,
} from './instructor-performance.service';

@ApiTags('analytics')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('manage/analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Headline platform counters' })
  overview(): Promise<PlatformOverview> {
    return this.analyticsService.overview();
  }

  @Get('revenue')
  @ApiOperation({ summary: 'Paid and refunded amounts per period and currency' })
  revenue(@Query() query: AnalyticsRangeQueryDto): Promise<RevenuePoint[]> {
    return this.analyticsService.revenueOverTime(query);
  }

  @Get('enrollments')
  @ApiOperation({ summary: 'New enrollments and completions per period' })
  enrollments(@Query() query: AnalyticsRangeQueryDto): Promise<EnrollmentPoint[]> {
    return this.analyticsService.enrollmentsOverTime(query);
  }

  @Get('top-courses')
  topCourses(@Query() query: TopCoursesQueryDto): Promise<TopCourse[]> {
    return this.analyticsService.topCourses(query);
  }

  @Get('cohort-completion')
  cohortCompletion(@Query() query: AnalyticsRangeQueryDto): Promise<CohortCompletion[]> {
    return this.analyticsService.cohortCompletionRates(query);
  }
}

@ApiTags('analytics')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.INSTRUCTOR)
@Controller('manage/instructors/:id/performance')
export class InstructorPerformanceController {
  constructor(private readonly performanceService: InstructorPerformanceService) {}

  @Get()
  @ApiOperation({ summary: 'Enrollments, completions and revenue since the last reset' })
  summary(
    @CurrentUser() actor: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<InstructorPerformance> {
    return this.performanceService.summary(actor, id);
  }

  @Roles(UserRole.ADMIN)
  @Post('reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start a new counting window for the instructor' })
  async reset(
    @CurrentUser() actor: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetPerformanceDto,
  ): Promise<{ resetAt: Date; note: string | null }> {
    const baseline = await this.performanceService.reset(actor, id, dto.note);
    return { resetAt: baseline.resetAt, note: baseline.note };
  }
}

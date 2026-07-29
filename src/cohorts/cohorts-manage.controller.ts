import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { AttendanceService, type CohortAttendanceSummary } from './attendance.service';
import {
  type AttendanceDto,
  type CohortDto,
  type CohortMemberDto,
  type SessionDto,
  toAttendanceDto,
  toCohortDto,
  toCohortMemberDto,
  toSessionDto,
} from './cohorts.mapper';
import { CohortsService } from './cohorts.service';
import {
  CreateCohortDto,
  CreateSessionDto,
  ListCohortsQueryDto,
  MarkAttendanceDto,
  UpdateCohortDto,
  UpdateSessionDto,
} from './dto/cohort.dto';

@ApiTags('cohorts')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.INSTRUCTOR)
@Controller('manage')
export class CohortsManageController {
  constructor(
    private readonly cohortsService: CohortsService,
    private readonly attendanceService: AttendanceService,
  ) {}

  @Get('cohorts')
  async list(
    @CurrentUser() actor: User,
    @Query() query: ListCohortsQueryDto,
  ): Promise<Paginated<CohortDto>> {
    const page = await this.cohortsService.listManaged(actor, query);
    return { items: page.items.map(toCohortDto), meta: page.meta };
  }

  @Post('courses/:courseId/cohorts')
  async create(
    @CurrentUser() actor: User,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Body() dto: CreateCohortDto,
  ): Promise<CohortDto> {
    return toCohortDto(await this.cohortsService.create(actor, courseId, dto));
  }

  @Get('cohorts/:id')
  async findOne(
    @CurrentUser() actor: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CohortDto> {
    return toCohortDto(await this.cohortsService.findManaged(actor, id));
  }

  @Patch('cohorts/:id')
  async update(
    @CurrentUser() actor: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCohortDto,
  ): Promise<CohortDto> {
    return toCohortDto(await this.cohortsService.update(actor, id, dto));
  }

  @Post('cohorts/:id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @CurrentUser() actor: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CohortDto> {
    return toCohortDto(await this.cohortsService.cancel(actor, id));
  }

  @Delete('cohorts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() actor: User, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.cohortsService.remove(actor, id);
  }

  @Get('cohorts/:id/roster')
  @ApiOperation({ summary: 'Enrolled, waitlisted and dropped learners with contact details' })
  async roster(
    @CurrentUser() actor: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CohortMemberDto[]> {
    return (await this.cohortsService.roster(actor, id)).map((member) =>
      toCohortMemberDto(member, true),
    );
  }

  @Post('cohorts/:id/sessions')
  async addSession(
    @CurrentUser() actor: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateSessionDto,
  ): Promise<SessionDto> {
    return toSessionDto(await this.cohortsService.addSession(actor, id, dto));
  }

  @Patch('sessions/:id')
  async updateSession(
    @CurrentUser() actor: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSessionDto,
  ): Promise<SessionDto> {
    return toSessionDto(await this.cohortsService.updateSession(actor, id, dto));
  }

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeSession(@CurrentUser() actor: User, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.cohortsService.removeSession(actor, id);
  }

  @Put('sessions/:id/attendance')
  @ApiOperation({ summary: 'Mark attendance for enrolled learners of a session' })
  async markAttendance(
    @CurrentUser() actor: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarkAttendanceDto,
  ): Promise<AttendanceDto[]> {
    return (await this.attendanceService.mark(actor, id, dto)).map(toAttendanceDto);
  }

  @Get('sessions/:id/attendance')
  async sessionAttendance(
    @CurrentUser() actor: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AttendanceDto[]> {
    return (await this.attendanceService.listForSession(actor, id)).map(toAttendanceDto);
  }

  @Get('cohorts/:id/attendance-summary')
  attendanceSummary(
    @CurrentUser() actor: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CohortAttendanceSummary> {
    return this.attendanceService.summary(actor, id);
  }
}

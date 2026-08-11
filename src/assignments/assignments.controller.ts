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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { type Paginated } from '../common/pagination/pagination';
import { UploadFileDto } from '../storage/dto/presign-upload.dto';
import { type PresignedUpload } from '../storage/storage.service';
import { type User } from '../users/entities/user.entity';
import {
  type AssignmentDto,
  type SubmissionDto,
  toAssignmentDto,
  toSubmissionDto,
} from './assignments.mapper';
import { AssignmentsService } from './assignments.service';
import {
  GradeSubmissionDto,
  ListSubmissionsQueryDto,
  SubmitAssignmentDto,
  UpsertAssignmentDto,
} from './dto/assignment.dto';
import { type Gradebook, GradebookService } from './gradebook.service';

export interface LearnerAssignmentDto {
  assignment: AssignmentDto;
  submissions: SubmissionDto[];
  canSubmit: boolean;
  reason: string | null;
}

@ApiTags('assignments')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.INSTRUCTOR)
@Controller('manage')
export class AssignmentsManageController {
  constructor(
    private readonly assignmentsService: AssignmentsService,
    private readonly gradebookService: GradebookService,
  ) {}

  @Put('lessons/:lessonId/assignment')
  @ApiOperation({ summary: 'Create or replace the assignment of an ASSIGNMENT lesson' })
  async upsert(
    @CurrentUser() actor: User,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Body() dto: UpsertAssignmentDto,
  ): Promise<AssignmentDto> {
    return toAssignmentDto(await this.assignmentsService.upsert(actor, lessonId, dto));
  }

  @Get('lessons/:lessonId/assignment')
  async findOne(
    @CurrentUser() actor: User,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
  ): Promise<AssignmentDto> {
    return toAssignmentDto(await this.assignmentsService.findForManage(actor, lessonId));
  }

  @Delete('lessons/:lessonId/assignment')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() actor: User,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
  ): Promise<void> {
    return this.assignmentsService.remove(actor, lessonId);
  }

  @Get('lessons/:lessonId/submissions')
  @ApiOperation({ summary: 'Submissions for an assignment with learner details' })
  async submissions(
    @CurrentUser() actor: User,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Query() query: ListSubmissionsQueryDto,
  ): Promise<Paginated<SubmissionDto>> {
    const page = await this.assignmentsService.listSubmissions(actor, lessonId, query);
    return { items: page.items.map((item) => toSubmissionDto(item, true)), meta: page.meta };
  }

  @Post('submissions/:id/grade')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Grade a submission with rubric scores or a total score' })
  async grade(
    @CurrentUser() actor: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GradeSubmissionDto,
  ): Promise<SubmissionDto> {
    return toSubmissionDto(await this.assignmentsService.grade(actor, id, dto));
  }

  @Get('cohorts/:cohortId/gradebook')
  @ApiOperation({ summary: 'Learners of a cohort against every assignment and quiz' })
  gradebook(
    @CurrentUser() actor: User,
    @Param('cohortId', ParseUUIDPipe) cohortId: string,
  ): Promise<Gradebook> {
    return this.gradebookService.forCohort(actor, cohortId);
  }
}

@ApiTags('assignments')
@ApiBearerAuth()
@Controller('assignments/lessons/:lessonId')
export class AssignmentsController {
  constructor(private readonly assignmentsService: AssignmentsService) {}

  @Get()
  @ApiOperation({ summary: 'The assignment, your submissions and whether you can submit' })
  async view(
    @CurrentUser() user: User,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
  ): Promise<LearnerAssignmentDto> {
    const view = await this.assignmentsService.viewForLearner(user, lessonId);
    return {
      assignment: toAssignmentDto(view.assignment),
      submissions: view.submissions.map((item) => toSubmissionDto(item)),
      canSubmit: view.canSubmit,
      reason: view.reason,
    };
  }

  @Post('uploads')
  @ApiOperation({ summary: 'Presign a file upload for a submission' })
  presign(
    @CurrentUser() user: User,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Body() dto: UploadFileDto,
  ): Promise<PresignedUpload> {
    return this.assignmentsService.presignUpload(user, lessonId, dto);
  }

  @Post('submissions')
  async submit(
    @CurrentUser() user: User,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Body() dto: SubmitAssignmentDto,
  ): Promise<SubmissionDto> {
    return toSubmissionDto(await this.assignmentsService.submit(user, lessonId, dto));
  }

  @Get('submissions')
  async mine(
    @CurrentUser() user: User,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
  ): Promise<SubmissionDto[]> {
    const submissions = await this.assignmentsService.mySubmissions(user, lessonId);
    return submissions.map((item) => toSubmissionDto(item));
  }
}

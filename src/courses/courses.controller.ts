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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { type Paginated } from '../common/pagination/pagination';
import { type User } from '../users/entities/user.entity';
import {
  type CourseDetailDto,
  type CourseSummaryDto,
  toCourseDetail,
  toCourseSummary,
} from './courses.mapper';
import { CoursesService } from './courses.service';
import { CreateCourseDto, ListManagedCoursesQueryDto, UpdateCourseDto } from './dto/course.dto';

/** Authoring surface used by instructors and admins. */
@ApiTags('courses')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.INSTRUCTOR)
@Controller('manage/courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Get()
  @ApiOperation({ summary: 'List courses you can manage' })
  async list(
    @CurrentUser() actor: User,
    @Query() query: ListManagedCoursesQueryDto,
  ): Promise<Paginated<CourseSummaryDto>> {
    const page = await this.coursesService.listManaged(actor, query);
    return { items: page.items.map(toCourseSummary), meta: page.meta };
  }

  @Post()
  async create(
    @CurrentUser() actor: User,
    @Body() dto: CreateCourseDto,
  ): Promise<CourseSummaryDto> {
    return toCourseSummary(await this.coursesService.create(actor, dto));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Full course with modules, lessons, materials and faqs' })
  async findOne(
    @CurrentUser() actor: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CourseDetailDto> {
    return toCourseDetail(await this.coursesService.findManaged(actor, id));
  }

  @Patch(':id')
  async update(
    @CurrentUser() actor: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCourseDto,
  ): Promise<CourseSummaryDto> {
    return toCourseSummary(await this.coursesService.update(actor, id, dto));
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  async archive(
    @CurrentUser() actor: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CourseSummaryDto> {
    return toCourseSummary(await this.coursesService.archive(actor, id));
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Publish a course that has at least one lesson' })
  async publish(
    @CurrentUser() actor: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CourseSummaryDto> {
    return toCourseSummary(await this.coursesService.publish(actor, id));
  }

  @Post(':id/unpublish')
  @HttpCode(HttpStatus.OK)
  async unpublish(
    @CurrentUser() actor: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CourseSummaryDto> {
    return toCourseSummary(await this.coursesService.unpublish(actor, id));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() actor: User, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.coursesService.remove(actor, id);
  }
}

import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { type User } from '../users/entities/user.entity';
import { type LessonDto, type ModuleDto, toLessonDto, toModuleDto } from './courses.mapper';
import { CurriculumService } from './curriculum.service';
import { CreateLessonDto, UpdateLessonDto } from './dto/lesson.dto';
import { CreateModuleDto, ReorderDto, UpdateModuleDto } from './dto/module.dto';

@ApiTags('courses')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.INSTRUCTOR)
@Controller('manage')
export class CurriculumController {
  constructor(private readonly curriculumService: CurriculumService) {}

  @Post('courses/:courseId/modules')
  async addModule(
    @CurrentUser() actor: User,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Body() dto: CreateModuleDto,
  ): Promise<ModuleDto> {
    return toModuleDto(await this.curriculumService.addModule(actor, courseId, dto));
  }

  @Put('courses/:courseId/modules/reorder')
  @ApiOperation({ summary: 'Reorder modules by listing every module id in the new order' })
  async reorderModules(
    @CurrentUser() actor: User,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Body() dto: ReorderDto,
  ): Promise<ModuleDto[]> {
    const modules = await this.curriculumService.reorderModules(actor, courseId, dto.ids);
    return modules.map((module) => toModuleDto(module));
  }

  @Patch('modules/:id')
  async updateModule(
    @CurrentUser() actor: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateModuleDto,
  ): Promise<ModuleDto> {
    return toModuleDto(await this.curriculumService.updateModule(actor, id, dto));
  }

  @Delete('modules/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeModule(@CurrentUser() actor: User, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.curriculumService.removeModule(actor, id);
  }

  @Post('modules/:moduleId/lessons')
  async addLesson(
    @CurrentUser() actor: User,
    @Param('moduleId', ParseUUIDPipe) moduleId: string,
    @Body() dto: CreateLessonDto,
  ): Promise<LessonDto> {
    return toLessonDto(await this.curriculumService.addLesson(actor, moduleId, dto));
  }

  @Put('modules/:moduleId/lessons/reorder')
  async reorderLessons(
    @CurrentUser() actor: User,
    @Param('moduleId', ParseUUIDPipe) moduleId: string,
    @Body() dto: ReorderDto,
  ): Promise<LessonDto[]> {
    const lessons = await this.curriculumService.reorderLessons(actor, moduleId, dto.ids);
    return lessons.map((lesson) => toLessonDto(lesson));
  }

  @Patch('lessons/:id')
  async updateLesson(
    @CurrentUser() actor: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLessonDto,
  ): Promise<LessonDto> {
    return toLessonDto(await this.curriculumService.updateLesson(actor, id, dto));
  }

  @Delete('lessons/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeLesson(@CurrentUser() actor: User, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.curriculumService.removeLesson(actor, id);
  }
}

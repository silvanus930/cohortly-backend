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
import { type PresignedUpload } from '../storage/storage.service';
import { UploadFileDto } from '../storage/dto/presign-upload.dto';
import { type User } from '../users/entities/user.entity';
import { CourseAssetsService } from './course-assets.service';
import {
  type CourseSummaryDto,
  type FaqDto,
  type MaterialDto,
  toCourseSummary,
  toFaqDto,
  toMaterialDto,
} from './courses.mapper';
import { CreateFaqDto, UpdateFaqDto } from './dto/faq.dto';
import { CreateMaterialDto } from './dto/material.dto';
import { ReorderDto } from './dto/module.dto';

@ApiTags('courses')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.INSTRUCTOR)
@Controller('manage')
export class CourseAssetsController {
  constructor(private readonly assetsService: CourseAssetsService) {}

  @Post('courses/:courseId/cover')
  @ApiOperation({ summary: 'Presign a cover image upload and point the course at it' })
  async presignCover(
    @CurrentUser() actor: User,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Body() dto: UploadFileDto,
  ): Promise<{ upload: PresignedUpload; course: CourseSummaryDto }> {
    const result = await this.assetsService.presignCover(actor, courseId, dto);
    return { upload: result.upload, course: toCourseSummary(result.course) };
  }

  @Post('lessons/:lessonId/materials')
  @ApiOperation({ summary: 'Register a lesson material and presign its upload' })
  async addMaterial(
    @CurrentUser() actor: User,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Body() dto: CreateMaterialDto,
  ): Promise<{ upload: PresignedUpload; material: MaterialDto }> {
    const result = await this.assetsService.addMaterial(actor, lessonId, dto);
    return { upload: result.upload, material: toMaterialDto(result.material) };
  }

  @Delete('materials/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMaterial(
    @CurrentUser() actor: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.assetsService.removeMaterial(actor, id);
  }

  @Post('courses/:courseId/faqs')
  async addFaq(
    @CurrentUser() actor: User,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Body() dto: CreateFaqDto,
  ): Promise<FaqDto> {
    return toFaqDto(await this.assetsService.addFaq(actor, courseId, dto));
  }

  @Put('courses/:courseId/faqs/reorder')
  async reorderFaqs(
    @CurrentUser() actor: User,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Body() dto: ReorderDto,
  ): Promise<FaqDto[]> {
    return (await this.assetsService.reorderFaqs(actor, courseId, dto.ids)).map(toFaqDto);
  }

  @Patch('faqs/:id')
  async updateFaq(
    @CurrentUser() actor: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFaqDto,
  ): Promise<FaqDto> {
    return toFaqDto(await this.assetsService.updateFaq(actor, id, dto));
  }

  @Delete('faqs/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeFaq(@CurrentUser() actor: User, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.assetsService.removeFaq(actor, id);
  }
}

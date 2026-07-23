import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { stripUndefined } from '../common/utils/strip-undefined';
import { type UploadFileDto } from '../storage/dto/presign-upload.dto';
import { type PresignedUpload, StorageService } from '../storage/storage.service';
import { type User } from '../users/entities/user.entity';
import { CoursesService } from './courses.service';
import { CurriculumService } from './curriculum.service';
import { CreateFaqDto, UpdateFaqDto } from './dto/faq.dto';
import { CreateMaterialDto } from './dto/material.dto';
import { CourseFaq } from './entities/course-faq.entity';
import { Course } from './entities/course.entity';
import { LessonMaterial } from './entities/lesson-material.entity';

/** Cover images, downloadable lesson materials and course FAQs. */
@Injectable()
export class CourseAssetsService {
  constructor(
    @InjectRepository(Course) private readonly courses: Repository<Course>,
    @InjectRepository(LessonMaterial) private readonly materials: Repository<LessonMaterial>,
    @InjectRepository(CourseFaq) private readonly faqs: Repository<CourseFaq>,
    private readonly coursesService: CoursesService,
    private readonly curriculumService: CurriculumService,
    private readonly storageService: StorageService,
  ) {}

  async presignCover(
    actor: User,
    courseId: string,
    dto: UploadFileDto,
  ): Promise<{ upload: PresignedUpload; course: Course }> {
    const course = await this.coursesService.findByIdOrFail(courseId);
    this.coursesService.assertCanManage(actor, course);
    const upload = await this.storageService.createPresignedUpload({
      kind: 'image',
      folder: `courses/${courseId}/cover`,
      fileName: dto.fileName,
      mimeType: dto.mimeType,
      sizeBytes: dto.sizeBytes,
    });
    course.coverUrl = upload.publicUrl;
    await this.courses.save(course);
    return { upload, course };
  }

  async addMaterial(
    actor: User,
    lessonId: string,
    dto: CreateMaterialDto,
  ): Promise<{ upload: PresignedUpload; material: LessonMaterial }> {
    const lesson = await this.curriculumService.findLessonForManage(actor, lessonId);
    const kind = dto.mimeType.toLowerCase().startsWith('video/') ? 'video' : 'document';
    const upload = await this.storageService.createPresignedUpload({
      kind,
      folder: `courses/${lesson.courseId}/lessons/${lessonId}`,
      fileName: dto.fileName,
      mimeType: dto.mimeType,
      sizeBytes: dto.sizeBytes,
    });
    const position = await this.materials.count({ where: { lessonId } });
    const material = await this.materials.save(
      this.materials.create({
        lessonId,
        title: dto.title.trim(),
        fileKey: upload.key,
        fileUrl: upload.publicUrl,
        mimeType: dto.mimeType,
        sizeBytes: String(dto.sizeBytes),
        position,
      }),
    );
    return { upload, material };
  }

  async removeMaterial(actor: User, materialId: string): Promise<void> {
    const material = await this.materials.findOne({ where: { id: materialId } });
    if (!material) {
      throw new NotFoundException(`Material ${materialId} was not found`);
    }
    await this.curriculumService.findLessonForManage(actor, material.lessonId);
    await this.materials.remove(material);
    await this.storageService.deleteObject(material.fileKey);
  }

  listFaqs(courseId: string): Promise<CourseFaq[]> {
    return this.faqs.find({ where: { courseId }, order: { position: 'ASC' } });
  }

  async addFaq(actor: User, courseId: string, dto: CreateFaqDto): Promise<CourseFaq> {
    const course = await this.coursesService.findByIdOrFail(courseId, []);
    this.coursesService.assertCanManage(actor, course);
    const position = await this.faqs.count({ where: { courseId } });
    return this.faqs.save(
      this.faqs.create({
        courseId,
        question: dto.question.trim(),
        answer: dto.answer.trim(),
        position,
      }),
    );
  }

  async updateFaq(actor: User, faqId: string, dto: UpdateFaqDto): Promise<CourseFaq> {
    const faq = await this.loadFaq(actor, faqId);
    Object.assign(faq, stripUndefined(dto));
    return this.faqs.save(faq);
  }

  async removeFaq(actor: User, faqId: string): Promise<void> {
    const faq = await this.loadFaq(actor, faqId);
    await this.faqs.remove(faq);
    const remaining = await this.listFaqs(faq.courseId);
    await Promise.all(
      remaining.map((row, position) => this.faqs.update({ id: row.id }, { position })),
    );
  }

  async reorderFaqs(actor: User, courseId: string, ids: string[]): Promise<CourseFaq[]> {
    const course = await this.coursesService.findByIdOrFail(courseId, []);
    this.coursesService.assertCanManage(actor, course);
    const existing = await this.faqs.find({ where: { courseId } });
    const current = new Set(existing.map((faq) => faq.id));
    if (
      current.size !== new Set(ids).size ||
      ids.length !== current.size ||
      ids.some((id) => !current.has(id))
    ) {
      throw new BadRequestException('The reorder request must list every faq exactly once');
    }
    await Promise.all(ids.map((id, position) => this.faqs.update({ id }, { position })));
    return this.listFaqs(courseId);
  }

  private async loadFaq(actor: User, faqId: string): Promise<CourseFaq> {
    const faq = await this.faqs.findOne({ where: { id: faqId } });
    if (!faq) {
      throw new NotFoundException(`FAQ ${faqId} was not found`);
    }
    const course = await this.coursesService.findByIdOrFail(faq.courseId, []);
    this.coursesService.assertCanManage(actor, course);
    return faq;
  }
}

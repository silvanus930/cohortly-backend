import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { stripUndefined } from '../common/utils/strip-undefined';
import { type User } from '../users/entities/user.entity';
import { CoursesService } from './courses.service';
import { CreateLessonDto, UpdateLessonDto } from './dto/lesson.dto';
import { CreateModuleDto, UpdateModuleDto } from './dto/module.dto';
import { CourseModule } from './entities/course-module.entity';
import { Course } from './entities/course.entity';
import { Lesson } from './entities/lesson.entity';

/**
 * Owns the ordered structure of a course: modules and the lessons inside
 * them. Positions are dense, zero based integers that are renumbered after
 * every removal or reorder, and the course duration is kept in sync.
 */
@Injectable()
export class CurriculumService {
  constructor(
    @InjectRepository(CourseModule) private readonly modules: Repository<CourseModule>,
    @InjectRepository(Lesson) private readonly lessons: Repository<Lesson>,
    @InjectRepository(Course) private readonly courses: Repository<Course>,
    private readonly coursesService: CoursesService,
  ) {}

  async listModules(courseId: string): Promise<CourseModule[]> {
    return this.modules.find({
      where: { courseId },
      relations: { lessons: { materials: true } },
      order: { position: 'ASC', lessons: { position: 'ASC' } },
    });
  }

  async addModule(actor: User, courseId: string, dto: CreateModuleDto): Promise<CourseModule> {
    const course = await this.coursesService.findByIdOrFail(courseId, []);
    this.coursesService.assertCanManage(actor, course);
    const position = await this.modules.count({ where: { courseId } });
    const module = await this.modules.save(
      this.modules.create({
        courseId,
        title: dto.title.trim(),
        description: dto.description ?? null,
        position,
      }),
    );
    module.lessons = [];
    return module;
  }

  async updateModule(actor: User, moduleId: string, dto: UpdateModuleDto): Promise<CourseModule> {
    const module = await this.loadModule(actor, moduleId);
    Object.assign(module, stripUndefined(dto));
    if (dto.title !== undefined) {
      module.title = dto.title.trim();
    }
    return this.modules.save(module);
  }

  async removeModule(actor: User, moduleId: string): Promise<void> {
    const module = await this.loadModule(actor, moduleId);
    await this.modules.remove(module);
    await this.renumberModules(module.courseId);
    await this.recomputeDuration(module.courseId);
  }

  async reorderModules(actor: User, courseId: string, ids: string[]): Promise<CourseModule[]> {
    const course = await this.coursesService.findByIdOrFail(courseId, []);
    this.coursesService.assertCanManage(actor, course);
    const existing = await this.modules.find({ where: { courseId } });
    this.assertSameIds(existing, ids, 'module');
    await this.applyOrder(this.modules, ids);
    return this.listModules(courseId);
  }

  async addLesson(actor: User, moduleId: string, dto: CreateLessonDto): Promise<Lesson> {
    const module = await this.loadModule(actor, moduleId);
    const position = await this.lessons.count({ where: { moduleId } });
    const lesson = await this.lessons.save(
      this.lessons.create({
        moduleId,
        courseId: module.courseId,
        title: dto.title.trim(),
        type: dto.type,
        position,
        durationMinutes: dto.durationMinutes ?? 0,
        contentUrl: dto.contentUrl ?? null,
        body: dto.body ?? null,
        isPreview: dto.isPreview ?? false,
      }),
    );
    await this.recomputeDuration(module.courseId);
    lesson.materials = [];
    return lesson;
  }

  async updateLesson(actor: User, lessonId: string, dto: UpdateLessonDto): Promise<Lesson> {
    const lesson = await this.loadLesson(actor, lessonId);
    Object.assign(lesson, stripUndefined(dto));
    if (dto.title !== undefined) {
      lesson.title = dto.title.trim();
    }
    const saved = await this.lessons.save(lesson);
    if (dto.durationMinutes !== undefined) {
      await this.recomputeDuration(lesson.courseId);
    }
    return saved;
  }

  async removeLesson(actor: User, lessonId: string): Promise<void> {
    const lesson = await this.loadLesson(actor, lessonId);
    await this.lessons.remove(lesson);
    await this.renumberLessons(lesson.moduleId);
    await this.recomputeDuration(lesson.courseId);
  }

  async reorderLessons(actor: User, moduleId: string, ids: string[]): Promise<Lesson[]> {
    await this.loadModule(actor, moduleId);
    const existing = await this.lessons.find({ where: { moduleId } });
    this.assertSameIds(existing, ids, 'lesson');
    await this.applyOrder(this.lessons, ids);
    return this.lessons.find({
      where: { moduleId },
      relations: { materials: true },
      order: { position: 'ASC' },
    });
  }

  async findLessonForManage(actor: User, lessonId: string): Promise<Lesson> {
    return this.loadLesson(actor, lessonId);
  }

  /** Sums lesson durations so the catalog can show course length without joins. */
  async recomputeDuration(courseId: string): Promise<number> {
    const row = await this.lessons
      .createQueryBuilder('lesson')
      .select('COALESCE(SUM(lesson.durationMinutes), 0)', 'total')
      .where('lesson.courseId = :courseId', { courseId })
      .getRawOne<{ total: string }>();
    const total = Number(row?.total ?? 0);
    await this.courses.update({ id: courseId }, { durationMinutes: total });
    return total;
  }

  private async loadModule(actor: User, moduleId: string): Promise<CourseModule> {
    const module = await this.modules.findOne({
      where: { id: moduleId },
      relations: { course: true },
    });
    if (!module?.course) {
      throw new NotFoundException(`Module ${moduleId} was not found`);
    }
    this.coursesService.assertCanManage(actor, module.course);
    return module;
  }

  private async loadLesson(actor: User, lessonId: string): Promise<Lesson> {
    const lesson = await this.lessons.findOne({
      where: { id: lessonId },
      relations: { materials: true },
    });
    if (!lesson) {
      throw new NotFoundException(`Lesson ${lessonId} was not found`);
    }
    const course = await this.coursesService.findByIdOrFail(lesson.courseId, []);
    this.coursesService.assertCanManage(actor, course);
    return lesson;
  }

  private assertSameIds(existing: { id: string }[], ids: string[], label: string): void {
    const current = new Set(existing.map((item) => item.id));
    const requested = new Set(ids);
    const sameSize = current.size === requested.size && ids.length === requested.size;
    if (!sameSize || ids.some((id) => !current.has(id))) {
      throw new BadRequestException(`The reorder request must list every ${label} exactly once`);
    }
  }

  private async applyOrder(
    repository: Repository<CourseModule> | Repository<Lesson>,
    ids: string[],
  ): Promise<void> {
    await Promise.all(
      ids.map((id, position) =>
        (repository as Repository<{ id: string; position: number }>).update({ id }, { position }),
      ),
    );
  }

  private async renumberModules(courseId: string): Promise<void> {
    const rows = await this.modules.find({ where: { courseId }, order: { position: 'ASC' } });
    await this.applyOrder(
      this.modules,
      rows.map((row) => row.id),
    );
  }

  private async renumberLessons(moduleId: string): Promise<void> {
    const rows = await this.lessons.find({ where: { moduleId }, order: { position: 'ASC' } });
    await this.applyOrder(
      this.lessons,
      rows.map((row) => row.id),
    );
  }
}

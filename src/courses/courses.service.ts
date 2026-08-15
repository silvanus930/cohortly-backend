import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { UserRole } from '../common/enums/user-role.enum';
import { type Paginated, paginateQuery } from '../common/pagination/pagination';
import { containsPattern } from '../common/utils/escape-like';
import { stripUndefined } from '../common/utils/strip-undefined';
import { uniqueSlug } from '../common/utils/slugify';
import { type User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { CategoriesService } from './categories.service';
import { CreateCourseDto, ListManagedCoursesQueryDto, UpdateCourseDto } from './dto/course.dto';
import { Course } from './entities/course.entity';
import { Lesson } from './entities/lesson.entity';
import { CoursePricing, CourseStatus } from './enums/course.enums';

export const STAFF_COURSE_ROLES: readonly UserRole[] = [UserRole.SUPERADMIN, UserRole.ADMIN];

export function isCourseStaff(user: Pick<User, 'role'>): boolean {
  return STAFF_COURSE_ROLES.includes(user.role);
}

@Injectable()
export class CoursesService {
  constructor(
    @InjectRepository(Course) private readonly courses: Repository<Course>,
    @InjectRepository(Lesson) private readonly lessons: Repository<Lesson>,
    private readonly categoriesService: CategoriesService,
    private readonly usersService: UsersService,
  ) {}

  /** Admins manage every course, instructors only the ones they own. */
  assertCanManage(actor: Pick<User, 'id' | 'role'>, course: Pick<Course, 'instructorId'>): void {
    if (isCourseStaff(actor) || course.instructorId === actor.id) {
      return;
    }
    throw new ForbiddenException('You can only manage your own courses');
  }

  async findByIdOrFail(
    id: string,
    relations: string[] = ['category', 'instructor'],
  ): Promise<Course> {
    const course = await this.courses.findOne({ where: { id }, relations });
    if (!course) {
      throw new NotFoundException(`Course ${id} was not found`);
    }
    return course;
  }

  findManyByIds(ids: string[]): Promise<Course[]> {
    if (ids.length === 0) {
      return Promise.resolve([]);
    }
    return this.courses.find({ where: { id: In(ids) } });
  }

  async findManaged(actor: User, id: string): Promise<Course> {
    const course = await this.findByIdOrFail(id, [
      'category',
      'instructor',
      'modules',
      'modules.lessons',
      'modules.lessons.materials',
      'faqs',
    ]);
    this.assertCanManage(actor, course);
    return course;
  }

  listManaged(actor: User, query: ListManagedCoursesQueryDto): Promise<Paginated<Course>> {
    const builder = this.courses
      .createQueryBuilder('course')
      .leftJoinAndSelect('course.category', 'category')
      .leftJoinAndSelect('course.instructor', 'instructor');
    const instructorId = isCourseStaff(actor) ? query.instructorId : actor.id;
    if (instructorId) {
      builder.andWhere('course.instructorId = :instructorId', { instructorId });
    }
    if (query.status) {
      builder.andWhere('course.status = :status', { status: query.status });
    }
    if (query.categoryId) {
      builder.andWhere('course.categoryId = :categoryId', { categoryId: query.categoryId });
    }
    if (query.search) {
      builder.andWhere('(course.title ILIKE :search OR course.summary ILIKE :search)', {
        search: containsPattern(query.search),
      });
    }
    builder.orderBy('course.updatedAt', 'DESC');
    return paginateQuery(builder, query);
  }

  async create(actor: User, dto: CreateCourseDto): Promise<Course> {
    const instructorId = await this.resolveInstructor(actor, dto.instructorId);
    if (dto.categoryId) {
      await this.categoriesService.findByIdOrFail(dto.categoryId);
    }
    const pricing = dto.pricing ?? CoursePricing.FREE;
    const priceCents = this.normalisePrice(pricing, dto.priceCents);
    const slug = await uniqueSlug(dto.title, (candidate) =>
      this.courses.exists({ where: { slug: candidate } }),
    );
    const course = this.courses.create({
      title: dto.title.trim(),
      slug,
      summary: dto.summary.trim(),
      description: dto.description ?? '',
      level: dto.level,
      pricing,
      priceCents,
      currency: (dto.currency ?? 'USD').toUpperCase(),
      categoryId: dto.categoryId ?? null,
      instructorId,
      tags: this.normaliseTags(dto.tags),
      coverUrl: dto.coverUrl ?? null,
      status: CourseStatus.DRAFT,
    });
    const saved = await this.courses.save(course);
    return this.findByIdOrFail(saved.id);
  }

  async update(actor: User, id: string, dto: UpdateCourseDto): Promise<Course> {
    const course = await this.findByIdOrFail(id);
    this.assertCanManage(actor, course);
    if (dto.instructorId !== undefined) {
      course.instructorId = await this.resolveInstructor(actor, dto.instructorId);
    }
    if (dto.categoryId !== undefined) {
      await this.categoriesService.findByIdOrFail(dto.categoryId);
      course.categoryId = dto.categoryId;
    }
    const { instructorId: _i, categoryId: _c, tags, currency, ...rest } = stripUndefined(dto);
    Object.assign(course, rest);
    if (tags !== undefined) {
      course.tags = this.normaliseTags(tags);
    }
    if (currency !== undefined) {
      course.currency = currency.toUpperCase();
    }
    course.priceCents = this.normalisePrice(course.pricing, course.priceCents);
    await this.courses.save(course);
    return this.findByIdOrFail(id);
  }

  async archive(actor: User, id: string): Promise<Course> {
    const course = await this.findByIdOrFail(id);
    this.assertCanManage(actor, course);
    course.status = CourseStatus.ARCHIVED;
    return this.courses.save(course);
  }

  async remove(actor: User, id: string): Promise<void> {
    const course = await this.findByIdOrFail(id);
    this.assertCanManage(actor, course);
    if (course.status !== CourseStatus.DRAFT || course.enrollmentCount > 0) {
      throw new BadRequestException('Only unpublished courses without enrollments can be deleted');
    }
    await this.courses.remove(course);
  }

  /** A course needs at least one lesson before learners can see it. */
  async publish(actor: User, id: string): Promise<Course> {
    const course = await this.findByIdOrFail(id);
    this.assertCanManage(actor, course);
    if (course.status === CourseStatus.PUBLISHED) {
      return course;
    }
    const lessonCount = await this.lessons.count({ where: { courseId: id } });
    if (lessonCount === 0) {
      throw new BadRequestException('Add at least one lesson before publishing');
    }
    if (course.pricing === CoursePricing.PAID && course.priceCents <= 0) {
      throw new BadRequestException('Paid courses need a price before publishing');
    }
    course.status = CourseStatus.PUBLISHED;
    course.publishedAt = course.publishedAt ?? new Date();
    await this.courses.save(course);
    return this.findByIdOrFail(id);
  }

  async unpublish(actor: User, id: string): Promise<Course> {
    const course = await this.findByIdOrFail(id);
    this.assertCanManage(actor, course);
    if (course.status !== CourseStatus.PUBLISHED) {
      throw new BadRequestException('Only published courses can be unpublished');
    }
    course.status = CourseStatus.DRAFT;
    await this.courses.save(course);
    return this.findByIdOrFail(id);
  }

  private async resolveInstructor(actor: User, requested?: string): Promise<string> {
    if (!requested || requested === actor.id) {
      return actor.id;
    }
    if (!isCourseStaff(actor)) {
      throw new ForbiddenException('Only admins can assign courses to other instructors');
    }
    const instructor = await this.usersService.findByIdOrFail(requested);
    if (![UserRole.INSTRUCTOR, UserRole.ADMIN, UserRole.SUPERADMIN].includes(instructor.role)) {
      throw new BadRequestException('The assigned user is not an instructor');
    }
    return instructor.id;
  }

  private normalisePrice(pricing: CoursePricing, priceCents: number | undefined): number {
    if (pricing === CoursePricing.FREE) {
      return 0;
    }
    if (!priceCents || priceCents <= 0) {
      throw new BadRequestException('Paid courses need a price greater than zero');
    }
    return priceCents;
  }

  private normaliseTags(tags: string[] | undefined): string[] {
    return [...new Set((tags ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
  }
}

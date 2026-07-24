import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, type SelectQueryBuilder } from 'typeorm';
import { type Paginated, paginateQuery } from '../common/pagination/pagination';
import { containsPattern } from '../common/utils/escape-like';
import { type User } from '../users/entities/user.entity';
import { isCourseStaff } from './courses.service';
import { type CatalogSort, ListCatalogQueryDto, RecommendationsQueryDto } from './dto/catalog.dto';
import { Course } from './entities/course.entity';
import { CourseStatus } from './enums/course.enums';

export interface CatalogCourseView {
  course: Course;
  /** Whether lesson bodies, urls and materials may be exposed to this viewer. */
  includeContent: boolean;
}

/** Decides whether a viewer may see a course's full lesson content. */
export type ContentAccessResolver = (course: Course, viewer: User | undefined) => Promise<boolean>;

@Injectable()
export class CatalogService {
  private readonly accessResolvers: ContentAccessResolver[] = [];

  constructor(@InjectRepository(Course) private readonly courses: Repository<Course>) {}

  /**
   * Other modules (for example enrollments) register resolvers that unlock
   * content for learners without the catalog depending on them directly.
   */
  registerContentAccessResolver(resolver: ContentAccessResolver): void {
    this.accessResolvers.push(resolver);
  }

  list(query: ListCatalogQueryDto): Promise<Paginated<Course>> {
    const builder = this.publishedQuery();
    if (query.search) {
      builder.andWhere(
        '(course.title ILIKE :search OR course.summary ILIKE :search OR :rawSearch = ANY(course.tags))',
        { search: containsPattern(query.search), rawSearch: query.search.trim().toLowerCase() },
      );
    }
    if (query.categoryId) {
      builder.andWhere('course.categoryId = :categoryId', { categoryId: query.categoryId });
    }
    if (query.category) {
      builder.andWhere('category.slug = :categorySlug', { categorySlug: query.category });
    }
    if (query.level) {
      builder.andWhere('course.level = :level', { level: query.level });
    }
    if (query.pricing) {
      builder.andWhere('course.pricing = :pricing', { pricing: query.pricing });
    }
    if (query.tag) {
      builder.andWhere(':tag = ANY(course.tags)', { tag: query.tag.trim().toLowerCase() });
    }
    this.applySort(builder, query.sort);
    return paginateQuery(builder, query);
  }

  async findBySlug(slug: string, viewer: User | undefined): Promise<CatalogCourseView> {
    const course = await this.courses.findOne({
      where: { slug },
      relations: {
        category: true,
        instructor: true,
        modules: { lessons: { materials: true } },
        faqs: true,
      },
    });
    const privileged = Boolean(course && viewer && this.canManage(course, viewer));
    if (!course || (course.status !== CourseStatus.PUBLISHED && !privileged)) {
      throw new NotFoundException('Course not found');
    }
    return { course, includeContent: privileged || (await this.hasContentAccess(course, viewer)) };
  }

  async recommend(viewer: User | undefined, query: RecommendationsQueryDto): Promise<Course[]> {
    const builder = this.publishedQuery()
      .orderBy('course.enrollmentCount', 'DESC')
      .addOrderBy('course.publishedAt', 'DESC')
      .take(query.limit);
    if (query.categoryId) {
      builder.andWhere('course.categoryId = :categoryId', { categoryId: query.categoryId });
    }
    if (viewer) {
      builder.andWhere('course.instructorId != :viewerId', { viewerId: viewer.id });
    }
    return builder.getMany();
  }

  async hasContentAccess(course: Course, viewer: User | undefined): Promise<boolean> {
    if (viewer && this.canManage(course, viewer)) {
      return true;
    }
    for (const resolver of this.accessResolvers) {
      if (await resolver(course, viewer)) {
        return true;
      }
    }
    return false;
  }

  private canManage(course: Course, viewer: User): boolean {
    return isCourseStaff(viewer) || course.instructorId === viewer.id;
  }

  private publishedQuery(): SelectQueryBuilder<Course> {
    return this.courses
      .createQueryBuilder('course')
      .leftJoinAndSelect('course.category', 'category')
      .leftJoinAndSelect('course.instructor', 'instructor')
      .where('course.status = :published', { published: CourseStatus.PUBLISHED });
  }

  private applySort(builder: SelectQueryBuilder<Course>, sort: CatalogSort): void {
    switch (sort) {
      case 'popular':
        builder.orderBy('course.enrollmentCount', 'DESC').addOrderBy('course.publishedAt', 'DESC');
        return;
      case 'title':
        builder.orderBy('course.title', 'ASC');
        return;
      case 'price':
        builder.orderBy('course.priceCents', 'ASC').addOrderBy('course.publishedAt', 'DESC');
        return;
      default:
        builder.orderBy('course.publishedAt', 'DESC').addOrderBy('course.id', 'ASC');
    }
  }
}

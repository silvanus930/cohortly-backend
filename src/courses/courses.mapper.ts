import { type Category } from './entities/category.entity';
import { type CourseFaq } from './entities/course-faq.entity';
import { type CourseModule } from './entities/course-module.entity';
import { type Course } from './entities/course.entity';
import { type LessonMaterial } from './entities/lesson-material.entity';
import { type Lesson } from './entities/lesson.entity';
import {
  type CourseLevel,
  type CoursePricing,
  type CourseStatus,
  type LessonType,
} from './enums/course.enums';

export interface CategorySummaryDto {
  id: string;
  name: string;
  slug: string;
}

export interface InstructorSummaryDto {
  id: string;
  fullName: string;
  avatarUrl: string | null;
}

export interface CourseSummaryDto {
  id: string;
  title: string;
  slug: string;
  summary: string;
  level: CourseLevel;
  pricing: CoursePricing;
  priceCents: number;
  currency: string;
  status: CourseStatus;
  coverUrl: string | null;
  tags: string[];
  durationMinutes: number;
  enrollmentCount: number;
  publishedAt: Date | null;
  category: CategorySummaryDto | null;
  instructor: InstructorSummaryDto | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MaterialDto {
  id: string;
  title: string;
  fileUrl: string;
  mimeType: string;
  sizeBytes: number;
  position: number;
}

export interface LessonDto {
  id: string;
  moduleId: string;
  title: string;
  type: LessonType;
  position: number;
  durationMinutes: number;
  isPreview: boolean;
  contentUrl: string | null;
  body: string | null;
  materials: MaterialDto[];
}

export interface ModuleDto {
  id: string;
  title: string;
  description: string | null;
  position: number;
  lessons: LessonDto[];
}

export interface FaqDto {
  id: string;
  question: string;
  answer: string;
  position: number;
}

export interface CourseDetailDto extends CourseSummaryDto {
  description: string;
  modules: ModuleDto[];
  faqs: FaqDto[];
}

export function toCategorySummary(
  category: Category | null | undefined,
): CategorySummaryDto | null {
  return category ? { id: category.id, name: category.name, slug: category.slug } : null;
}

export function toCourseSummary(course: Course): CourseSummaryDto {
  return {
    id: course.id,
    title: course.title,
    slug: course.slug,
    summary: course.summary,
    level: course.level,
    pricing: course.pricing,
    priceCents: course.priceCents,
    currency: course.currency,
    status: course.status,
    coverUrl: course.coverUrl,
    tags: course.tags,
    durationMinutes: course.durationMinutes,
    enrollmentCount: course.enrollmentCount,
    publishedAt: course.publishedAt,
    category: toCategorySummary(course.category),
    instructor: course.instructor
      ? {
          id: course.instructor.id,
          fullName: `${course.instructor.firstName} ${course.instructor.lastName}`.trim(),
          avatarUrl: course.instructor.avatarUrl,
        }
      : null,
    createdAt: course.createdAt,
    updatedAt: course.updatedAt,
  };
}

export function toMaterialDto(material: LessonMaterial): MaterialDto {
  return {
    id: material.id,
    title: material.title,
    fileUrl: material.fileUrl,
    mimeType: material.mimeType,
    sizeBytes: Number(material.sizeBytes),
    position: material.position,
  };
}

/** Pass `includeContent = false` to hide lesson bodies and urls from non enrolled visitors. */
export function toLessonDto(lesson: Lesson, includeContent = true): LessonDto {
  const reveal = includeContent || lesson.isPreview;
  return {
    id: lesson.id,
    moduleId: lesson.moduleId,
    title: lesson.title,
    type: lesson.type,
    position: lesson.position,
    durationMinutes: lesson.durationMinutes,
    isPreview: lesson.isPreview,
    contentUrl: reveal ? lesson.contentUrl : null,
    body: reveal ? lesson.body : null,
    materials: reveal ? (lesson.materials ?? []).map(toMaterialDto) : [],
  };
}

export function toModuleDto(module: CourseModule, includeContent = true): ModuleDto {
  return {
    id: module.id,
    title: module.title,
    description: module.description,
    position: module.position,
    lessons: [...(module.lessons ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((lesson) => toLessonDto(lesson, includeContent)),
  };
}

export function toFaqDto(faq: CourseFaq): FaqDto {
  return { id: faq.id, question: faq.question, answer: faq.answer, position: faq.position };
}

export function toCourseDetail(course: Course, includeContent = true): CourseDetailDto {
  return {
    ...toCourseSummary(course),
    description: course.description,
    modules: [...(course.modules ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((module) => toModuleDto(module, includeContent)),
    faqs: [...(course.faqs ?? [])].sort((a, b) => a.position - b.position).map(toFaqDto),
  };
}

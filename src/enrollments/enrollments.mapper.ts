import { type CourseSummaryDto, toCourseSummary } from '../courses/courses.mapper';
import { type User } from '../users/entities/user.entity';
import { type Enrollment } from './entities/enrollment.entity';
import { type LessonProgress } from './entities/lesson-progress.entity';
import {
  type EnrollmentSource,
  type EnrollmentStatus,
  type LessonProgressStatus,
} from './enums/enrollment.enums';

export interface EnrollmentDto {
  id: string;
  courseId: string;
  course: CourseSummaryDto | null;
  cohortId: string | null;
  source: EnrollmentSource;
  status: EnrollmentStatus;
  progressPercent: number;
  completedLessons: number;
  totalLessons: number;
  lastActivityAt: Date | null;
  completedAt: Date | null;
  enrolledAt: Date;
  learner?: { id: string; fullName: string; email: string; avatarUrl: string | null };
}

export interface LessonProgressDto {
  lessonId: string;
  status: LessonProgressStatus;
  positionSeconds: number;
  startedAt: Date | null;
  completedAt: Date | null;
}

function learnerSummary(user: User): EnrollmentDto['learner'] {
  return {
    id: user.id,
    fullName: `${user.firstName} ${user.lastName}`.trim(),
    email: user.email,
    avatarUrl: user.avatarUrl,
  };
}

export function toEnrollmentDto(enrollment: Enrollment, withLearner = false): EnrollmentDto {
  const dto: EnrollmentDto = {
    id: enrollment.id,
    courseId: enrollment.courseId,
    course: enrollment.course ? toCourseSummary(enrollment.course) : null,
    cohortId: enrollment.cohortId,
    source: enrollment.source,
    status: enrollment.status,
    progressPercent: enrollment.progressPercent,
    completedLessons: enrollment.completedLessons,
    totalLessons: enrollment.totalLessons,
    lastActivityAt: enrollment.lastActivityAt,
    completedAt: enrollment.completedAt,
    enrolledAt: enrollment.createdAt,
  };
  if (withLearner && enrollment.user) {
    dto.learner = learnerSummary(enrollment.user);
  }
  return dto;
}

export function toLessonProgressDto(progress: LessonProgress): LessonProgressDto {
  return {
    lessonId: progress.lessonId,
    status: progress.status,
    positionSeconds: progress.positionSeconds,
    startedAt: progress.startedAt,
    completedAt: progress.completedAt,
  };
}

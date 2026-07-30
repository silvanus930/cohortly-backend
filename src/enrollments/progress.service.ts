import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CurriculumService } from '../courses/curriculum.service';
import { Lesson } from '../courses/entities/lesson.entity';
import { type LessonType } from '../courses/enums/course.enums';
import { type User } from '../users/entities/user.entity';
import { type UpdateLessonProgressDto } from './dto/enrollment.dto';
import { EnrollmentsService } from './enrollments.service';
import { type Enrollment } from './entities/enrollment.entity';
import { LearningActivityDay } from './entities/learning-activity.entity';
import { LessonProgress } from './entities/lesson-progress.entity';
import { EnrollmentStatus, LessonProgressStatus } from './enums/enrollment.enums';

/** Throws to block completing a lesson, for example when a quiz gate is not passed. */
export type LessonGate = (user: User, lesson: Lesson, enrollment: Enrollment) => Promise<void>;

export interface LessonOutlineItem {
  id: string;
  title: string;
  type: LessonType;
  position: number;
  durationMinutes: number;
  isPreview: boolean;
  status: LessonProgressStatus;
  positionSeconds: number;
  completedAt: Date | null;
}

export interface ModuleOutline {
  id: string;
  title: string;
  position: number;
  lessons: LessonOutlineItem[];
}

export interface CourseProgress {
  enrollment: Enrollment;
  modules: ModuleOutline[];
  nextLesson: LessonOutlineItem | null;
}

export interface StreakSummary {
  currentStreak: number;
  longestStreak: number;
  activeDaysLast30: number;
  lastActiveDate: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

@Injectable()
export class ProgressService {
  private readonly gates: LessonGate[] = [];

  constructor(
    @InjectRepository(LessonProgress) private readonly progress: Repository<LessonProgress>,
    @InjectRepository(LearningActivityDay)
    private readonly activity: Repository<LearningActivityDay>,
    @InjectRepository(Lesson) private readonly lessons: Repository<Lesson>,
    private readonly enrollmentsService: EnrollmentsService,
    private readonly curriculumService: CurriculumService,
  ) {}

  registerLessonGate(gate: LessonGate): void {
    this.gates.push(gate);
  }

  async update(
    user: User,
    lessonId: string,
    dto: UpdateLessonProgressDto,
  ): Promise<{ progress: LessonProgress; enrollment: Enrollment }> {
    const lesson = await this.lessons.findOne({ where: { id: lessonId } });
    if (!lesson) {
      throw new NotFoundException(`Lesson ${lessonId} was not found`);
    }
    const enrollment = await this.enrollmentsService.requireAccessible(user.id, lesson.courseId);
    if (dto.status === LessonProgressStatus.COMPLETED) {
      for (const gate of this.gates) {
        await gate(user, lesson, enrollment);
      }
    }

    const now = new Date();
    const row =
      (await this.progress.findOne({ where: { enrollmentId: enrollment.id, lessonId } })) ??
      this.progress.create({
        enrollmentId: enrollment.id,
        lessonId,
        userId: user.id,
        courseId: lesson.courseId,
        status: LessonProgressStatus.NOT_STARTED,
        positionSeconds: 0,
        startedAt: null,
        completedAt: null,
      });
    const wasCompleted = row.status === LessonProgressStatus.COMPLETED;
    row.startedAt = row.startedAt ?? now;
    if (dto.positionSeconds !== undefined) {
      row.positionSeconds = dto.positionSeconds;
    }
    if (dto.status === LessonProgressStatus.COMPLETED && !wasCompleted) {
      row.status = LessonProgressStatus.COMPLETED;
      row.completedAt = now;
    } else if (!wasCompleted) {
      row.status = LessonProgressStatus.IN_PROGRESS;
    }
    const saved = await this.progress.save(row);

    const justCompleted = saved.status === LessonProgressStatus.COMPLETED && !wasCompleted;
    await this.recordActivity(user.id, justCompleted);
    const refreshed = await this.refreshEnrollment(enrollment, user);
    return { progress: saved, enrollment: refreshed };
  }

  async courseProgress(user: User, courseId: string): Promise<CourseProgress> {
    const enrollment = await this.enrollmentsService.requireAccessible(user.id, courseId);
    const modules = await this.buildOutline(enrollment);
    return { enrollment, modules, nextLesson: this.firstIncomplete(modules) };
  }

  async nextLesson(enrollment: Enrollment): Promise<LessonOutlineItem | null> {
    return this.firstIncomplete(await this.buildOutline(enrollment));
  }

  async recordActivity(userId: string, lessonCompleted: boolean): Promise<void> {
    const activityDate = toDateKey(new Date());
    const existing = await this.activity.findOne({ where: { userId, activityDate } });
    if (existing) {
      if (lessonCompleted) {
        await this.activity.increment({ id: existing.id }, 'lessonsCompleted', 1);
      }
      return;
    }
    await this.activity.save(
      this.activity.create({ userId, activityDate, lessonsCompleted: lessonCompleted ? 1 : 0 }),
    );
  }

  async streak(userId: string): Promise<StreakSummary> {
    const rows = await this.activity.find({
      where: { userId },
      order: { activityDate: 'DESC' },
      take: 400,
    });
    const days = rows.map((row) => toDateKey(new Date(row.activityDate)));
    const today = toDateKey(new Date());
    const yesterday = toDateKey(new Date(Date.now() - DAY_MS));
    const set = new Set(days);

    let currentStreak = 0;
    let cursor = set.has(today) ? today : set.has(yesterday) ? yesterday : null;
    while (cursor && set.has(cursor)) {
      currentStreak += 1;
      cursor = toDateKey(new Date(new Date(cursor).getTime() - DAY_MS));
    }

    let longestStreak = 0;
    let run = 0;
    let previous: string | null = null;
    for (const day of [...days].sort()) {
      const expected = previous ? toDateKey(new Date(new Date(previous).getTime() + DAY_MS)) : null;
      run = expected === day ? run + 1 : 1;
      longestStreak = Math.max(longestStreak, run);
      previous = day;
    }

    const cutoff = toDateKey(new Date(Date.now() - 30 * DAY_MS));
    return {
      currentStreak,
      longestStreak,
      activeDaysLast30: days.filter((day) => day >= cutoff).length,
      lastActiveDate: days[0] ?? null,
    };
  }

  private async refreshEnrollment(enrollment: Enrollment, user: User): Promise<Enrollment> {
    const [completed, total] = await Promise.all([
      this.progress.count({
        where: { enrollmentId: enrollment.id, status: LessonProgressStatus.COMPLETED },
      }),
      this.lessons.count({ where: { courseId: enrollment.courseId } }),
    ]);
    enrollment.completedLessons = completed;
    enrollment.totalLessons = total;
    enrollment.progressPercent =
      total === 0 ? 0 : Math.min(100, Math.round((completed / total) * 100));
    enrollment.lastActivityAt = new Date();
    const saved = await this.enrollmentsService.save(enrollment);
    if (total > 0 && completed >= total && saved.status === EnrollmentStatus.ACTIVE) {
      return this.enrollmentsService.markCompleted(saved, user);
    }
    return saved;
  }

  private async buildOutline(enrollment: Enrollment): Promise<ModuleOutline[]> {
    const [modules, rows] = await Promise.all([
      this.curriculumService.listModules(enrollment.courseId),
      this.progress.find({ where: { enrollmentId: enrollment.id } }),
    ]);
    const byLesson = new Map(rows.map((row) => [row.lessonId, row]));
    return modules.map((module) => ({
      id: module.id,
      title: module.title,
      position: module.position,
      lessons: [...(module.lessons ?? [])]
        .sort((a, b) => a.position - b.position)
        .map((lesson) => {
          const row = byLesson.get(lesson.id);
          return {
            id: lesson.id,
            title: lesson.title,
            type: lesson.type,
            position: lesson.position,
            durationMinutes: lesson.durationMinutes,
            isPreview: lesson.isPreview,
            status: row?.status ?? LessonProgressStatus.NOT_STARTED,
            positionSeconds: row?.positionSeconds ?? 0,
            completedAt: row?.completedAt ?? null,
          };
        }),
    }));
  }

  private firstIncomplete(modules: ModuleOutline[]): LessonOutlineItem | null {
    for (const module of modules) {
      const lesson = module.lessons.find((item) => item.status !== LessonProgressStatus.COMPLETED);
      if (lesson) {
        return lesson;
      }
    }
    return null;
  }
}

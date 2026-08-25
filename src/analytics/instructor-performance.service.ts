import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { UserRole } from '../common/enums/user-role.enum';
import { type User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { InstructorPerformanceBaseline } from './entities/instructor-performance-baseline.entity';

export interface InstructorPerformance {
  instructor: { id: string; fullName: string; email: string };
  since: Date | null;
  publishedCourses: number;
  cohortsRun: number;
  enrollments: number;
  completions: number;
  completionRate: number;
  distinctLearners: number;
  revenueCents: number;
  averageProgressPercent: number;
  gradedSubmissions: number;
}

const EPOCH = new Date(0);

/**
 * Rolls up what an instructor's courses produced since their last reset.
 * Resets do not delete anything; they only move the counting window.
 */
@Injectable()
export class InstructorPerformanceService {
  constructor(
    @InjectRepository(InstructorPerformanceBaseline)
    private readonly baselines: Repository<InstructorPerformanceBaseline>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly usersService: UsersService,
  ) {}

  /** Admins may inspect anyone, instructors only themselves. */
  assertCanView(actor: User, instructorId: string): void {
    const isStaff = actor.role === UserRole.ADMIN || actor.role === UserRole.SUPERADMIN;
    if (!isStaff && actor.id !== instructorId) {
      throw new ForbiddenException('You can only view your own performance');
    }
  }

  async summary(actor: User, instructorId: string): Promise<InstructorPerformance> {
    this.assertCanView(actor, instructorId);
    const instructor = await this.usersService.findByIdOrFail(instructorId);
    const baseline = await this.baselines.findOne({ where: { userId: instructorId } });
    const since = baseline?.resetAt ?? null;
    const from = since ?? EPOCH;

    const [row] = await this.dataSource.query<
      {
        published_courses: string;
        cohorts_run: string;
        enrollments: string;
        completions: string;
        distinct_learners: string;
        revenue_cents: string;
        average_progress: string | null;
        graded_submissions: string;
      }[]
    >(
      `
      SELECT
        (SELECT COUNT(*) FROM courses WHERE instructor_id = $1 AND status = 'PUBLISHED') AS published_courses,
        (SELECT COUNT(*) FROM cohorts WHERE instructor_id = $1 AND created_at >= $2) AS cohorts_run,
        COUNT(e.id) AS enrollments,
        COUNT(e.id) FILTER (WHERE e.status = 'COMPLETED') AS completions,
        COUNT(DISTINCT e.user_id) AS distinct_learners,
        COALESCE(SUM(
          CASE WHEN p.status = 'PAID'
            THEN p.amount_cents / GREATEST(jsonb_array_length(p.items), 1)
            ELSE 0 END
        ), 0) AS revenue_cents,
        AVG(e.progress_percent) AS average_progress,
        (
          SELECT COUNT(*) FROM submissions s
          JOIN assignments a ON a.id = s.assignment_id
          JOIN courses ac ON ac.id = a.course_id
          WHERE ac.instructor_id = $1 AND s.graded_at >= $2
        ) AS graded_submissions
      FROM enrollments e
      JOIN courses c ON c.id = e.course_id AND c.instructor_id = $1
      LEFT JOIN purchases p ON p.id = e.purchase_id
      WHERE e.created_at >= $2 AND e.status <> 'CANCELLED'
    `,
      [instructorId, from],
    );

    const enrollments = Number(row.enrollments);
    const completions = Number(row.completions);
    return {
      instructor: {
        id: instructor.id,
        fullName: `${instructor.firstName} ${instructor.lastName}`.trim(),
        email: instructor.email,
      },
      since,
      publishedCourses: Number(row.published_courses),
      cohortsRun: Number(row.cohorts_run),
      enrollments,
      completions,
      completionRate: enrollments === 0 ? 0 : Math.round((completions / enrollments) * 100),
      distinctLearners: Number(row.distinct_learners),
      revenueCents: Number(row.revenue_cents),
      averageProgressPercent: Math.round(Number(row.average_progress ?? 0)),
      gradedSubmissions: Number(row.graded_submissions),
    };
  }

  async reset(
    actor: User,
    instructorId: string,
    note?: string,
  ): Promise<InstructorPerformanceBaseline> {
    await this.usersService.findByIdOrFail(instructorId);
    const baseline =
      (await this.baselines.findOne({ where: { userId: instructorId } })) ??
      this.baselines.create({ userId: instructorId });
    baseline.resetAt = new Date();
    baseline.resetById = actor.id;
    baseline.note = note?.trim() || null;
    return this.baselines.save(baseline);
  }
}

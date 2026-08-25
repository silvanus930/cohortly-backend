import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  type AnalyticsRangeQueryDto,
  type Granularity,
  type TopCoursesQueryDto,
} from './dto/analytics.dto';

export interface DateRange {
  from: Date;
  to: Date;
  granularity: Granularity;
}

export interface RevenuePoint {
  bucket: string;
  currency: string;
  revenueCents: number;
  refundedCents: number;
  purchases: number;
}

export interface EnrollmentPoint {
  bucket: string;
  enrollments: number;
  completions: number;
}

export interface TopCourse {
  courseId: string;
  title: string;
  slug: string;
  enrollments: number;
  completions: number;
  revenueCents: number;
}

export interface CohortCompletion {
  cohortId: string;
  title: string;
  courseTitle: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
  enrolled: number;
  completed: number;
  completionRate: number;
}

export interface PlatformOverview {
  users: number;
  publishedCourses: number;
  activeEnrollments: number;
  completedEnrollments: number;
  activeCohorts: number;
  revenueCents: number;
  refundedCents: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAYS: Record<Granularity, number> = { day: 30, week: 12 * 7, month: 365 };

export function resolveRange(query: AnalyticsRangeQueryDto): DateRange {
  const granularity = query.granularity ?? 'day';
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from
    ? new Date(query.from)
    : new Date(to.getTime() - DEFAULT_DAYS[granularity] * DAY_MS);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new BadRequestException('from and to must be valid ISO dates');
  }
  if (from.getTime() >= to.getTime()) {
    throw new BadRequestException('from must be before to');
  }
  return { from, to, granularity };
}

function bucketKey(value: unknown): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

/**
 * Read only aggregations for the admin dashboard. Uses plain SQL so the
 * database does the grouping instead of loading rows into memory.
 */
@Injectable()
export class AnalyticsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async overview(): Promise<PlatformOverview> {
    const [row] = await this.dataSource.query<
      {
        users: string;
        published_courses: string;
        active_enrollments: string;
        completed_enrollments: string;
        active_cohorts: string;
        revenue_cents: string;
        refunded_cents: string;
      }[]
    >(`
      SELECT
        (SELECT COUNT(*) FROM users) AS users,
        (SELECT COUNT(*) FROM courses WHERE status = 'PUBLISHED') AS published_courses,
        (SELECT COUNT(*) FROM enrollments WHERE status = 'ACTIVE') AS active_enrollments,
        (SELECT COUNT(*) FROM enrollments WHERE status = 'COMPLETED') AS completed_enrollments,
        (SELECT COUNT(*) FROM cohorts WHERE status IN ('SCHEDULED', 'ACTIVE')) AS active_cohorts,
        (SELECT COALESCE(SUM(amount_cents), 0) FROM purchases WHERE status = 'PAID') AS revenue_cents,
        (SELECT COALESCE(SUM(amount_cents), 0) FROM purchases WHERE status = 'REFUNDED') AS refunded_cents
    `);
    return {
      users: Number(row.users),
      publishedCourses: Number(row.published_courses),
      activeEnrollments: Number(row.active_enrollments),
      completedEnrollments: Number(row.completed_enrollments),
      activeCohorts: Number(row.active_cohorts),
      revenueCents: Number(row.revenue_cents),
      refundedCents: Number(row.refunded_cents),
    };
  }

  async revenueOverTime(query: AnalyticsRangeQueryDto): Promise<RevenuePoint[]> {
    const range = resolveRange(query);
    const rows = await this.dataSource.query<
      {
        bucket: Date;
        currency: string;
        revenue_cents: string;
        refunded_cents: string;
        purchases: string;
      }[]
    >(
      `
      SELECT
        date_trunc($1, paid_at) AS bucket,
        currency,
        COALESCE(SUM(CASE WHEN status = 'PAID' THEN amount_cents ELSE 0 END), 0) AS revenue_cents,
        COALESCE(SUM(CASE WHEN status = 'REFUNDED' THEN amount_cents ELSE 0 END), 0) AS refunded_cents,
        COUNT(*) AS purchases
      FROM purchases
      WHERE paid_at >= $2 AND paid_at < $3 AND status IN ('PAID', 'REFUNDED')
      GROUP BY bucket, currency
      ORDER BY bucket ASC, currency ASC
    `,
      [range.granularity, range.from, range.to],
    );
    return rows.map((row) => ({
      bucket: bucketKey(row.bucket),
      currency: row.currency,
      revenueCents: Number(row.revenue_cents),
      refundedCents: Number(row.refunded_cents),
      purchases: Number(row.purchases),
    }));
  }

  async enrollmentsOverTime(query: AnalyticsRangeQueryDto): Promise<EnrollmentPoint[]> {
    const range = resolveRange(query);
    const rows = await this.dataSource.query<
      { bucket: Date; enrollments: string; completions: string }[]
    >(
      `
      SELECT bucket, SUM(enrollments) AS enrollments, SUM(completions) AS completions
      FROM (
        SELECT date_trunc($1, created_at) AS bucket, COUNT(*) AS enrollments, 0 AS completions
        FROM enrollments
        WHERE created_at >= $2 AND created_at < $3 AND status <> 'CANCELLED'
        GROUP BY bucket
        UNION ALL
        SELECT date_trunc($1, completed_at) AS bucket, 0 AS enrollments, COUNT(*) AS completions
        FROM enrollments
        WHERE completed_at >= $2 AND completed_at < $3
        GROUP BY bucket
      ) AS series
      GROUP BY bucket
      ORDER BY bucket ASC
    `,
      [range.granularity, range.from, range.to],
    );
    return rows.map((row) => ({
      bucket: bucketKey(row.bucket),
      enrollments: Number(row.enrollments),
      completions: Number(row.completions),
    }));
  }

  async topCourses(query: TopCoursesQueryDto): Promise<TopCourse[]> {
    const range = resolveRange(query);
    const rows = await this.dataSource.query<
      {
        course_id: string;
        title: string;
        slug: string;
        enrollments: string;
        completions: string;
        revenue_cents: string;
      }[]
    >(
      `
      SELECT
        c.id AS course_id,
        c.title,
        c.slug,
        COUNT(e.id) AS enrollments,
        COUNT(e.id) FILTER (WHERE e.status = 'COMPLETED') AS completions,
        COALESCE(SUM(
          CASE WHEN p.status = 'PAID'
            THEN p.amount_cents / GREATEST(jsonb_array_length(p.items), 1)
            ELSE 0 END
        ), 0) AS revenue_cents
      FROM courses c
      JOIN enrollments e ON e.course_id = c.id
        AND e.created_at >= $1 AND e.created_at < $2 AND e.status <> 'CANCELLED'
      LEFT JOIN purchases p ON p.id = e.purchase_id
      GROUP BY c.id, c.title, c.slug
      ORDER BY enrollments DESC, revenue_cents DESC, c.title ASC
      LIMIT $3
    `,
      [range.from, range.to, query.limit ?? 10],
    );
    return rows.map((row) => ({
      courseId: row.course_id,
      title: row.title,
      slug: row.slug,
      enrollments: Number(row.enrollments),
      completions: Number(row.completions),
      revenueCents: Number(row.revenue_cents),
    }));
  }

  async cohortCompletionRates(query: AnalyticsRangeQueryDto): Promise<CohortCompletion[]> {
    const range = resolveRange(query);
    const rows = await this.dataSource.query<
      {
        cohort_id: string;
        title: string;
        course_title: string;
        status: string;
        starts_at: Date;
        ends_at: Date;
        enrolled: string;
        completed: string;
      }[]
    >(
      `
      SELECT
        co.id AS cohort_id,
        co.title,
        c.title AS course_title,
        co.status,
        co.starts_at,
        co.ends_at,
        COUNT(m.id) AS enrolled,
        COUNT(m.id) FILTER (WHERE e.status = 'COMPLETED') AS completed
      FROM cohorts co
      JOIN courses c ON c.id = co.course_id
      LEFT JOIN cohort_members m ON m.cohort_id = co.id AND m.status = 'ENROLLED'
      LEFT JOIN enrollments e ON e.user_id = m.user_id AND e.course_id = co.course_id
      WHERE co.starts_at < $2 AND co.ends_at >= $1
      GROUP BY co.id, co.title, c.title, co.status, co.starts_at, co.ends_at
      ORDER BY co.starts_at DESC
    `,
      [range.from, range.to],
    );
    return rows.map((row) => {
      const enrolled = Number(row.enrolled);
      const completed = Number(row.completed);
      return {
        cohortId: row.cohort_id,
        title: row.title,
        courseTitle: row.course_title,
        status: row.status,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        enrolled,
        completed,
        completionRate: enrolled === 0 ? 0 : Math.round((completed / enrolled) * 100),
      };
    });
  }
}

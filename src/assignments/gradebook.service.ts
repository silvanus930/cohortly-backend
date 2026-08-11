import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CohortsService } from '../cohorts/cohorts.service';
import { CohortMemberStatus } from '../cohorts/enums/cohort.enums';
import { Enrollment } from '../enrollments/entities/enrollment.entity';
import { Quiz } from '../quizzes/entities/quiz.entity';
import { QuizzesService } from '../quizzes/quizzes.service';
import { type User } from '../users/entities/user.entity';
import { AssignmentsService, submissionPassed } from './assignments.service';
import { SubmissionStatus } from './enums/assignment.enums';

export interface GradebookColumn {
  id: string;
  kind: 'assignment' | 'quiz';
  lessonId: string;
  title: string;
  maxPoints: number;
}

export interface GradebookCell {
  columnId: string;
  score: number | null;
  maxPoints: number;
  percent: number | null;
  status: 'NOT_SUBMITTED' | 'SUBMITTED' | 'PASSED' | 'FAILED' | 'RETURNED';
}

export interface GradebookRow {
  learner: { id: string; fullName: string; email: string };
  progressPercent: number;
  cells: GradebookCell[];
  averagePercent: number | null;
}

export interface Gradebook {
  cohort: { id: string; title: string; courseId: string };
  columns: GradebookColumn[];
  rows: GradebookRow[];
}

/** Builds the per cohort matrix of learners against graded work. */
@Injectable()
export class GradebookService {
  constructor(
    @InjectRepository(Enrollment) private readonly enrollments: Repository<Enrollment>,
    @InjectRepository(Quiz) private readonly quizzes: Repository<Quiz>,
    private readonly cohortsService: CohortsService,
    private readonly quizzesService: QuizzesService,
    private readonly assignmentsService: AssignmentsService,
  ) {}

  async forCohort(actor: User, cohortId: string): Promise<Gradebook> {
    const cohort = await this.cohortsService.findManaged(actor, cohortId);
    const roster = (await this.cohortsService.roster(actor, cohortId)).filter(
      (member) => member.status === CohortMemberStatus.ENROLLED && member.user,
    );
    const userIds = roster.map((member) => member.userId);

    const [assignments, quizzes, enrollments, submissions, bestAttempts] = await Promise.all([
      this.assignmentsService.listForCourse(cohort.courseId),
      this.quizzes.find({ where: { courseId: cohort.courseId }, relations: { lesson: true } }),
      userIds.length > 0
        ? this.enrollments.find({ where: { courseId: cohort.courseId, userId: In(userIds) } })
        : Promise.resolve([]),
      this.assignmentsService.latestSubmissionsForCourse(cohort.courseId, userIds),
      this.quizzesService.bestScoresForCourse(cohort.courseId),
    ]);

    const columns: GradebookColumn[] = [
      ...assignments.map((assignment) => ({
        id: assignment.id,
        kind: 'assignment' as const,
        lessonId: assignment.lessonId,
        title: assignment.title,
        maxPoints: assignment.maxPoints,
        position: assignment.lesson?.position ?? 0,
      })),
      ...quizzes.map((quiz) => ({
        id: quiz.id,
        kind: 'quiz' as const,
        lessonId: quiz.lessonId,
        title: quiz.title,
        maxPoints: 100,
        position: quiz.lesson?.position ?? 0,
      })),
    ]
      .sort((a, b) => a.position - b.position)
      .map(({ position: _p, ...column }) => column);

    const progressByUser = new Map(enrollments.map((row) => [row.userId, row.progressPercent]));
    const rows: GradebookRow[] = roster.map((member) => {
      const user = member.user!;
      const cells: GradebookCell[] = [];
      for (const assignment of assignments) {
        const submission = submissions.get(member.userId)?.get(assignment.id);
        if (!submission) {
          cells.push(this.cell(assignment.id, null, assignment.maxPoints, 'NOT_SUBMITTED'));
          continue;
        }
        const status =
          submission.status === SubmissionStatus.SUBMITTED
            ? 'SUBMITTED'
            : submission.status === SubmissionStatus.RETURNED
              ? 'RETURNED'
              : submissionPassed(submission, assignment)
                ? 'PASSED'
                : 'FAILED';
        cells.push(this.cell(assignment.id, submission.score, assignment.maxPoints, status));
      }
      for (const quiz of quizzes) {
        const best = bestAttempts.get(member.userId)?.get(quiz.id);
        cells.push(
          best
            ? this.cell(quiz.id, best.scorePercent, 100, best.passed ? 'PASSED' : 'FAILED')
            : this.cell(quiz.id, null, 100, 'NOT_SUBMITTED'),
        );
      }
      const orderedCells = columns.map((column) => cells.find((c) => c.columnId === column.id)!);
      const graded = orderedCells.filter((c) => c.percent !== null);
      return {
        learner: {
          id: user.id,
          fullName: `${user.firstName} ${user.lastName}`.trim(),
          email: user.email,
        },
        progressPercent: progressByUser.get(member.userId) ?? 0,
        cells: orderedCells,
        averagePercent:
          graded.length === 0
            ? null
            : Math.round(graded.reduce((sum, c) => sum + (c.percent ?? 0), 0) / graded.length),
      };
    });

    return {
      cohort: { id: cohort.id, title: cohort.title, courseId: cohort.courseId },
      columns,
      rows,
    };
  }

  private cell(
    columnId: string,
    score: number | null,
    maxPoints: number,
    status: GradebookCell['status'],
  ): GradebookCell {
    return {
      columnId,
      score,
      maxPoints,
      percent: score === null || maxPoints === 0 ? null : Math.round((score / maxPoints) * 100),
      status,
    };
  }
}

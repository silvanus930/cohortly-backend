import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { type Paginated, paginateRepository } from '../common/pagination/pagination';
import { appConfig } from '../config/configuration';
import { CoursesService } from '../courses/courses.service';
import { CurriculumService } from '../courses/curriculum.service';
import { LessonType } from '../courses/enums/course.enums';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { LessonProgressStatus } from '../enrollments/enums/enrollment.enums';
import { ProgressService } from '../enrollments/progress.service';
import { MailService } from '../mail/mail.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { type UploadFileDto } from '../storage/dto/presign-upload.dto';
import { type PresignedUpload, StorageService } from '../storage/storage.service';
import { type User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import {
  GradeSubmissionDto,
  ListSubmissionsQueryDto,
  SubmitAssignmentDto,
  UpsertAssignmentDto,
} from './dto/assignment.dto';
import { Assignment, type RubricCriterion } from './entities/assignment.entity';
import { type RubricScore, Submission } from './entities/submission.entity';
import { SubmissionStatus, SubmissionType } from './enums/assignment.enums';

export interface LearnerAssignmentView {
  assignment: Assignment;
  submissions: Submission[];
  canSubmit: boolean;
  reason: string | null;
}

export function submissionPassed(submission: Submission, assignment: Assignment): boolean | null {
  return submission.score === null ? null : submission.score >= assignment.passingPoints;
}

function normaliseRubric(
  rubric: UpsertAssignmentDto['rubric'],
  maxPoints: number,
): RubricCriterion[] {
  if (!rubric || rubric.length === 0) {
    return [];
  }
  const ids = new Set<string>();
  const criteria = rubric.map((item) => {
    if (ids.has(item.id)) {
      throw new BadRequestException(`Duplicate rubric criterion id "${item.id}"`);
    }
    ids.add(item.id);
    return {
      id: item.id,
      criterion: item.criterion.trim(),
      description: item.description?.trim() || null,
      maxPoints: item.maxPoints,
    };
  });
  const total = criteria.reduce((sum, item) => sum + item.maxPoints, 0);
  if (total !== maxPoints) {
    throw new BadRequestException(
      `Rubric points add up to ${total} but the assignment is worth ${maxPoints}`,
    );
  }
  return criteria;
}

@Injectable()
export class AssignmentsService {
  private readonly logger = new Logger(AssignmentsService.name);

  constructor(
    @InjectRepository(Assignment) private readonly assignments: Repository<Assignment>,
    @InjectRepository(Submission) private readonly submissions: Repository<Submission>,
    private readonly coursesService: CoursesService,
    private readonly curriculumService: CurriculumService,
    private readonly enrollmentsService: EnrollmentsService,
    private readonly progressService: ProgressService,
    private readonly storageService: StorageService,
    private readonly notificationsService: NotificationsService,
    private readonly mailService: MailService,
    private readonly usersService: UsersService,
    @Inject(appConfig.KEY) private readonly app: ConfigType<typeof appConfig>,
  ) {}

  async upsert(actor: User, lessonId: string, dto: UpsertAssignmentDto): Promise<Assignment> {
    const lesson = await this.curriculumService.findLessonForManage(actor, lessonId);
    if (lesson.type !== LessonType.ASSIGNMENT) {
      throw new BadRequestException(
        'Assignments can only be attached to lessons of type ASSIGNMENT',
      );
    }
    const maxPoints = dto.maxPoints ?? 100;
    const passingPoints = dto.passingPoints ?? Math.ceil(maxPoints * 0.6);
    if (passingPoints > maxPoints) {
      throw new BadRequestException('Passing points cannot exceed the maximum points');
    }
    const assignment =
      (await this.assignments.findOne({ where: { lessonId } })) ??
      this.assignments.create({ lessonId, courseId: lesson.courseId });
    assignment.title = dto.title.trim();
    assignment.instructions = dto.instructions;
    assignment.submissionType = dto.submissionType ?? SubmissionType.TEXT_OR_FILE;
    assignment.maxPoints = maxPoints;
    assignment.passingPoints = passingPoints;
    assignment.rubric = normaliseRubric(dto.rubric, maxPoints);
    assignment.allowResubmission = dto.allowResubmission ?? true;
    assignment.maxSubmissions = dto.maxSubmissions ?? 3;
    return this.assignments.save(assignment);
  }

  async findForManage(actor: User, lessonId: string): Promise<Assignment> {
    await this.curriculumService.findLessonForManage(actor, lessonId);
    return this.findByLessonOrFail(lessonId);
  }

  async remove(actor: User, lessonId: string): Promise<void> {
    const assignment = await this.findForManage(actor, lessonId);
    await this.assignments.remove(assignment);
  }

  async findByLessonOrFail(lessonId: string): Promise<Assignment> {
    const assignment = await this.assignments.findOne({ where: { lessonId } });
    if (!assignment) {
      throw new NotFoundException('This lesson has no assignment');
    }
    return assignment;
  }

  listForCourse(courseId: string): Promise<Assignment[]> {
    return this.assignments.find({ where: { courseId }, relations: { lesson: true } });
  }

  async viewForLearner(user: User, lessonId: string): Promise<LearnerAssignmentView> {
    const assignment = await this.findByLessonOrFail(lessonId);
    await this.enrollmentsService.requireAccessible(user.id, assignment.courseId);
    const submissions = await this.submissions.find({
      where: { assignmentId: assignment.id, userId: user.id },
      order: { attemptNumber: 'ASC' },
    });
    const reason = this.submissionBlocker(assignment, submissions);
    return { assignment, submissions, canSubmit: reason === null, reason };
  }

  async presignUpload(user: User, lessonId: string, dto: UploadFileDto): Promise<PresignedUpload> {
    const assignment = await this.findByLessonOrFail(lessonId);
    await this.enrollmentsService.requireAccessible(user.id, assignment.courseId);
    if (assignment.submissionType === SubmissionType.TEXT) {
      throw new BadRequestException('This assignment only accepts text submissions');
    }
    return this.storageService.createPresignedUpload({
      kind: dto.mimeType.toLowerCase().startsWith('video/') ? 'video' : 'document',
      folder: `submissions/${assignment.id}/${user.id}`,
      fileName: dto.fileName,
      mimeType: dto.mimeType,
      sizeBytes: dto.sizeBytes,
    });
  }

  async submit(user: User, lessonId: string, dto: SubmitAssignmentDto): Promise<Submission> {
    const assignment = await this.findByLessonOrFail(lessonId);
    const enrollment = await this.enrollmentsService.requireAccessible(
      user.id,
      assignment.courseId,
    );
    this.assertContent(assignment, dto);
    const previous = await this.submissions.find({
      where: { assignmentId: assignment.id, userId: user.id },
      order: { attemptNumber: 'ASC' },
    });
    const blocker = this.submissionBlocker(assignment, previous);
    if (blocker) {
      throw new ConflictException(blocker);
    }

    const submission = await this.submissions.save(
      this.submissions.create({
        assignmentId: assignment.id,
        userId: user.id,
        enrollmentId: enrollment.id,
        attemptNumber: previous.length + 1,
        text: dto.text?.trim() || null,
        fileKey: dto.fileKey ?? null,
        fileUrl: dto.fileUrl ?? null,
        status: SubmissionStatus.SUBMITTED,
        score: null,
        rubricScores: [],
        feedback: null,
        gradedById: null,
        gradedAt: null,
        submittedAt: new Date(),
      }),
    );
    await this.progressService.update(user, lessonId, { status: LessonProgressStatus.IN_PROGRESS });

    const course = await this.coursesService.findByIdOrFail(assignment.courseId, []);
    await this.notificationsService.notify(course.instructorId, {
      type: NotificationType.SUBMISSION_RECEIVED,
      title: `New submission for ${assignment.title}`,
      body: `${user.firstName} ${user.lastName} submitted attempt ${submission.attemptNumber}.`,
      data: { submissionId: submission.id, lessonId, courseId: course.id },
    });
    return submission;
  }

  async mySubmissions(user: User, lessonId: string): Promise<Submission[]> {
    const assignment = await this.findByLessonOrFail(lessonId);
    return this.submissions.find({
      where: { assignmentId: assignment.id, userId: user.id },
      order: { attemptNumber: 'ASC' },
    });
  }

  async listSubmissions(
    actor: User,
    lessonId: string,
    query: ListSubmissionsQueryDto,
  ): Promise<Paginated<Submission>> {
    const assignment = await this.findForManage(actor, lessonId);
    return paginateRepository(
      this.submissions,
      {
        where: {
          assignmentId: assignment.id,
          ...(query.status ? { status: query.status } : {}),
          ...(query.userId ? { userId: query.userId } : {}),
        },
        relations: { user: true },
        order: { submittedAt: 'DESC' },
      },
      query,
    );
  }

  /**
   * Records a grade. Passing scores complete the lesson; failing ones return
   * the work for another attempt when the assignment allows it.
   */
  async grade(actor: User, submissionId: string, dto: GradeSubmissionDto): Promise<Submission> {
    const submission = await this.submissions.findOne({
      where: { id: submissionId },
      relations: { assignment: true },
    });
    if (!submission?.assignment) {
      throw new NotFoundException(`Submission ${submissionId} was not found`);
    }
    const assignment = submission.assignment;
    const course = await this.coursesService.findByIdOrFail(assignment.courseId);
    this.coursesService.assertCanManage(actor, course);

    const { score, rubricScores } = this.computeScore(assignment, dto);
    const passed = score >= assignment.passingPoints;
    submission.score = score;
    submission.rubricScores = rubricScores;
    submission.feedback = dto.feedback?.trim() || null;
    submission.gradedById = actor.id;
    submission.gradedAt = new Date();
    submission.status =
      passed || !assignment.allowResubmission ? SubmissionStatus.GRADED : SubmissionStatus.RETURNED;
    const saved = await this.submissions.save(submission);

    const learner = await this.usersService.findByIdOrFail(submission.userId);
    if (passed) {
      await this.progressService.update(learner, assignment.lessonId, {
        status: LessonProgressStatus.COMPLETED,
      });
    }
    await this.notificationsService.notify(learner.id, {
      type: NotificationType.GRADE_POSTED,
      title: `Grade posted for ${assignment.title}`,
      body: `You scored ${score} of ${assignment.maxPoints} points.${passed ? '' : ' Review the feedback and try again.'}`,
      data: { submissionId: saved.id, lessonId: assignment.lessonId, courseId: course.id, passed },
    });
    this.mailService
      .sendGradePosted(
        learner,
        assignment.title,
        course.title,
        score,
        assignment.maxPoints,
        passed,
        `${this.app.url}/courses/${course.slug}`,
      )
      .catch((error: unknown) => {
        this.logger.warn(`Grade email failed for ${learner.email}: ${String(error)}`);
      });
    return saved;
  }

  /** Latest submission per learner and assignment for a course, keyed by user id. */
  async latestSubmissionsForCourse(
    courseId: string,
    userIds: string[],
  ): Promise<Map<string, Map<string, Submission>>> {
    const result = new Map<string, Map<string, Submission>>();
    if (userIds.length === 0) {
      return result;
    }
    const assignments = await this.assignments.find({ where: { courseId }, select: { id: true } });
    if (assignments.length === 0) {
      return result;
    }
    const rows = await this.submissions.find({
      where: { assignmentId: In(assignments.map((a) => a.id)), userId: In(userIds) },
      order: { attemptNumber: 'DESC' },
    });
    for (const row of rows) {
      const perAssignment = result.get(row.userId) ?? new Map<string, Submission>();
      if (!perAssignment.has(row.assignmentId)) {
        perAssignment.set(row.assignmentId, row);
      }
      result.set(row.userId, perAssignment);
    }
    return result;
  }

  private assertContent(assignment: Assignment, dto: SubmitAssignmentDto): void {
    const hasText = Boolean(dto.text?.trim());
    const hasFile = Boolean(dto.fileKey && dto.fileUrl);
    if (assignment.submissionType === SubmissionType.TEXT && !hasText) {
      throw new BadRequestException('This assignment requires a text answer');
    }
    if (assignment.submissionType === SubmissionType.FILE && !hasFile) {
      throw new BadRequestException('This assignment requires an uploaded file');
    }
    if (!hasText && !hasFile) {
      throw new BadRequestException('Provide a text answer or an uploaded file');
    }
  }

  private submissionBlocker(assignment: Assignment, submissions: Submission[]): string | null {
    const latest = submissions[submissions.length - 1];
    if (!latest) {
      return null;
    }
    if (latest.status === SubmissionStatus.SUBMITTED) {
      return 'Your previous submission is still waiting to be graded';
    }
    if (submissionPassed(latest, assignment)) {
      return 'You already passed this assignment';
    }
    if (!assignment.allowResubmission) {
      return 'This assignment does not allow resubmissions';
    }
    if (assignment.maxSubmissions > 0 && submissions.length >= assignment.maxSubmissions) {
      return 'You have used every submission attempt';
    }
    return null;
  }

  private computeScore(
    assignment: Assignment,
    dto: GradeSubmissionDto,
  ): { score: number; rubricScores: RubricScore[] } {
    if (assignment.rubric.length === 0) {
      if (dto.score === undefined) {
        throw new BadRequestException('A score is required for assignments without a rubric');
      }
      if (dto.score > assignment.maxPoints) {
        throw new BadRequestException(`The score cannot exceed ${assignment.maxPoints}`);
      }
      return { score: dto.score, rubricScores: [] };
    }
    const scores = dto.rubricScores ?? [];
    const byCriterion = new Map(scores.map((item) => [item.criterionId, item]));
    if (byCriterion.size !== scores.length) {
      throw new BadRequestException('Each rubric criterion may only be scored once');
    }
    const rubricScores = assignment.rubric.map((criterion) => {
      const entry = byCriterion.get(criterion.id);
      if (!entry) {
        throw new BadRequestException(`Missing score for criterion "${criterion.criterion}"`);
      }
      if (entry.points > criterion.maxPoints) {
        throw new BadRequestException(
          `"${criterion.criterion}" is worth at most ${criterion.maxPoints} points`,
        );
      }
      return {
        criterionId: criterion.id,
        points: entry.points,
        comment: entry.comment?.trim() || null,
      };
    });
    const unknown = scores.filter(
      (item) => !assignment.rubric.some((c) => c.id === item.criterionId),
    );
    if (unknown.length > 0) {
      throw new BadRequestException(
        `Unknown rubric criteria: ${unknown.map((u) => u.criterionId).join(', ')}`,
      );
    }
    return { score: rubricScores.reduce((sum, item) => sum + item.points, 0), rubricScores };
  }
}

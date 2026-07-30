import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CohortsService } from '../cohorts/cohorts.service';
import { PaymentRequiredException } from '../common/exceptions/payment-required.exception';
import { type Paginated, paginateQuery } from '../common/pagination/pagination';
import { containsPattern } from '../common/utils/escape-like';
import { CoursesService } from '../courses/courses.service';
import { Course } from '../courses/entities/course.entity';
import { Lesson } from '../courses/entities/lesson.entity';
import { CoursePricing, CourseStatus } from '../courses/enums/course.enums';
import { OrganizationsService } from '../organizations/organizations.service';
import { type User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import {
  EnrollDto,
  ListCourseEnrollmentsQueryDto,
  ListMyEnrollmentsQueryDto,
} from './dto/enrollment.dto';
import { Enrollment } from './entities/enrollment.entity';
import { EnrollmentSource, EnrollmentStatus } from './enums/enrollment.enums';

/** Statuses that grant access to course content. */
export const ACCESS_STATUSES: readonly EnrollmentStatus[] = [
  EnrollmentStatus.ACTIVE,
  EnrollmentStatus.COMPLETED,
];

export type EnrollmentCompletedHandler = (enrollment: Enrollment, user: User) => Promise<void>;

@Injectable()
export class EnrollmentsService {
  private readonly logger = new Logger(EnrollmentsService.name);
  private readonly completionHandlers: EnrollmentCompletedHandler[] = [];

  constructor(
    @InjectRepository(Enrollment) private readonly enrollments: Repository<Enrollment>,
    @InjectRepository(Lesson) private readonly lessons: Repository<Lesson>,
    @InjectRepository(Course) private readonly courses: Repository<Course>,
    private readonly coursesService: CoursesService,
    private readonly cohortsService: CohortsService,
    private readonly organizationsService: OrganizationsService,
    private readonly usersService: UsersService,
  ) {}

  /** Certificates and referrals react to completions without coupling this module to them. */
  registerCompletionHandler(handler: EnrollmentCompletedHandler): void {
    this.completionHandlers.push(handler);
  }

  async enroll(user: User, dto: EnrollDto): Promise<Enrollment> {
    const course = await this.coursesService.findByIdOrFail(dto.courseId, []);
    if (course.status !== CourseStatus.PUBLISHED) {
      throw new BadRequestException('This course is not open for enrollment');
    }
    const existing = await this.enrollments.findOne({
      where: { userId: user.id, courseId: course.id },
    });
    if (existing && existing.status !== EnrollmentStatus.CANCELLED) {
      throw new ConflictException('You are already enrolled in this course');
    }

    let source = EnrollmentSource.FREE;
    let seatAssignmentId: string | null = null;
    if (course.pricing === CoursePricing.PAID) {
      const seat = await this.organizationsService.findActiveSeat(user.id, course.id);
      if (!seat) {
        throw new PaymentRequiredException(
          'This course requires a purchase or an organization seat',
        );
      }
      source = EnrollmentSource.SEAT;
      seatAssignmentId = seat.id;
    }

    const enrollment = await this.activate(existing, user.id, course, source, {
      seatAssignmentId,
      purchaseId: null,
    });

    if (dto.cohortId) {
      const cohort = await this.cohortsService.findByIdOrFail(dto.cohortId, []);
      if (cohort.courseId !== course.id) {
        throw new BadRequestException('The cohort does not belong to this course');
      }
      await this.cohortsService.join(user, cohort.id);
      enrollment.cohortId = cohort.id;
      await this.enrollments.save(enrollment);
    }
    return this.findByIdOrFail(enrollment.id);
  }

  /** Called by the payments module once a course purchase is confirmed. */
  async enrollFromPurchase(
    userId: string,
    courseId: string,
    purchaseId: string,
  ): Promise<Enrollment> {
    const [user, course] = await Promise.all([
      this.usersService.findByIdOrFail(userId),
      this.coursesService.findByIdOrFail(courseId, []),
    ]);
    const existing = await this.enrollments.findOne({ where: { userId: user.id, courseId } });
    if (existing && existing.status !== EnrollmentStatus.CANCELLED) {
      if (!existing.purchaseId) {
        existing.purchaseId = purchaseId;
        await this.enrollments.save(existing);
      }
      return existing;
    }
    return this.activate(existing, user.id, course, EnrollmentSource.PAID, {
      purchaseId,
      seatAssignmentId: null,
    });
  }

  async cancel(user: User, enrollmentId: string): Promise<Enrollment> {
    const enrollment = await this.findByIdOrFail(enrollmentId);
    if (enrollment.userId !== user.id) {
      throw new ForbiddenException('You can only cancel your own enrollments');
    }
    if (enrollment.status !== EnrollmentStatus.ACTIVE) {
      throw new BadRequestException('Only active enrollments can be cancelled');
    }
    enrollment.status = EnrollmentStatus.CANCELLED;
    enrollment.cancelledAt = new Date();
    await this.enrollments.save(enrollment);
    await this.courses.decrement({ id: enrollment.courseId }, 'enrollmentCount', 1);
    if (enrollment.cohortId) {
      try {
        await this.cohortsService.leave(user, enrollment.cohortId);
      } catch (error) {
        this.logger.warn(`Could not leave cohort ${enrollment.cohortId}: ${String(error)}`);
      }
    }
    return enrollment;
  }

  async findByIdOrFail(id: string): Promise<Enrollment> {
    const enrollment = await this.enrollments.findOne({
      where: { id },
      relations: { course: { category: true, instructor: true } },
    });
    if (!enrollment) {
      throw new NotFoundException(`Enrollment ${id} was not found`);
    }
    return enrollment;
  }

  findAccessible(userId: string, courseId: string): Promise<Enrollment | null> {
    return this.enrollments.findOne({
      where: { userId, courseId, status: In([...ACCESS_STATUSES]) },
    });
  }

  async hasAccess(userId: string, courseId: string): Promise<boolean> {
    return this.enrollments.exists({
      where: { userId, courseId, status: In([...ACCESS_STATUSES]) },
    });
  }

  async requireAccessible(userId: string, courseId: string): Promise<Enrollment> {
    const enrollment = await this.findAccessible(userId, courseId);
    if (!enrollment) {
      throw new ForbiddenException('You are not enrolled in this course');
    }
    return enrollment;
  }

  listMine(user: User, query: ListMyEnrollmentsQueryDto): Promise<Paginated<Enrollment>> {
    const builder = this.enrollments
      .createQueryBuilder('enrollment')
      .innerJoinAndSelect('enrollment.course', 'course')
      .leftJoinAndSelect('course.category', 'category')
      .leftJoinAndSelect('course.instructor', 'instructor')
      .where('enrollment.userId = :userId', { userId: user.id });
    if (query.status) {
      builder.andWhere('enrollment.status = :status', { status: query.status });
    } else {
      builder.andWhere('enrollment.status != :cancelled', {
        cancelled: EnrollmentStatus.CANCELLED,
      });
    }
    builder
      .orderBy('enrollment.lastActivityAt', 'DESC', 'NULLS LAST')
      .addOrderBy('enrollment.createdAt', 'DESC');
    return paginateQuery(builder, query);
  }

  /** The most recently touched active enrollment, used for the continue learning card. */
  async mostRecentActive(user: User): Promise<Enrollment | null> {
    return this.enrollments.findOne({
      where: { userId: user.id, status: EnrollmentStatus.ACTIVE },
      relations: { course: { category: true, instructor: true } },
      order: { lastActivityAt: { direction: 'DESC', nulls: 'LAST' }, createdAt: 'DESC' },
    });
  }

  async listForCourse(
    actor: User,
    courseId: string,
    query: ListCourseEnrollmentsQueryDto,
  ): Promise<Paginated<Enrollment>> {
    const course = await this.coursesService.findByIdOrFail(courseId, []);
    this.coursesService.assertCanManage(actor, course);
    const builder = this.enrollments
      .createQueryBuilder('enrollment')
      .innerJoinAndSelect('enrollment.user', 'user')
      .where('enrollment.courseId = :courseId', { courseId });
    if (query.status) {
      builder.andWhere('enrollment.status = :status', { status: query.status });
    }
    if (query.search) {
      builder.andWhere(
        '(user.email ILIKE :search OR user.firstName ILIKE :search OR user.lastName ILIKE :search)',
        { search: containsPattern(query.search) },
      );
    }
    builder.orderBy('enrollment.createdAt', 'DESC');
    return paginateQuery(builder, query);
  }

  /** Marks the enrollment complete and notifies registered handlers. */
  async markCompleted(enrollment: Enrollment, user: User): Promise<Enrollment> {
    if (enrollment.status === EnrollmentStatus.COMPLETED) {
      return enrollment;
    }
    enrollment.status = EnrollmentStatus.COMPLETED;
    enrollment.completedAt = new Date();
    const saved = await this.enrollments.save(enrollment);
    for (const handler of this.completionHandlers) {
      try {
        await handler(saved, user);
      } catch (error) {
        this.logger.error(`Completion handler failed for ${saved.id}: ${String(error)}`);
      }
    }
    return saved;
  }

  async save(enrollment: Enrollment): Promise<Enrollment> {
    return this.enrollments.save(enrollment);
  }

  private async activate(
    existing: Enrollment | null,
    userId: string,
    course: Course,
    source: EnrollmentSource,
    refs: { purchaseId: string | null; seatAssignmentId: string | null },
  ): Promise<Enrollment> {
    const totalLessons = await this.lessons.count({ where: { courseId: course.id } });
    const enrollment = existing ?? this.enrollments.create({ userId, courseId: course.id });
    enrollment.status = EnrollmentStatus.ACTIVE;
    enrollment.source = source;
    enrollment.purchaseId = refs.purchaseId;
    enrollment.seatAssignmentId = refs.seatAssignmentId;
    enrollment.totalLessons = totalLessons;
    enrollment.cancelledAt = null;
    enrollment.completedAt = null;
    enrollment.cohortId = null;
    const saved = await this.enrollments.save(enrollment);
    await this.courses.increment({ id: course.id }, 'enrollmentCount', 1);
    return saved;
  }
}

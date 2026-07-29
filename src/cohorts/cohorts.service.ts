import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, type EntityManager, In, Repository } from 'typeorm';
import { UserRole } from '../common/enums/user-role.enum';
import { type Paginated, paginateQuery } from '../common/pagination/pagination';
import { stripUndefined } from '../common/utils/strip-undefined';
import { CoursesService, isCourseStaff } from '../courses/courses.service';
import { CourseStatus } from '../courses/enums/course.enums';
import { type User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import {
  CreateCohortDto,
  CreateSessionDto,
  ListCohortsQueryDto,
  UpdateCohortDto,
  UpdateSessionDto,
} from './dto/cohort.dto';
import { CohortMember } from './entities/cohort-member.entity';
import { CohortSession } from './entities/cohort-session.entity';
import { Cohort } from './entities/cohort.entity';
import { CohortMemberStatus, CohortStatus } from './enums/cohort.enums';

/** Throws to deny a learner joining a cohort. Registered by other modules. */
export type CohortJoinPolicy = (user: User, cohort: Cohort) => Promise<void>;

export const OPEN_COHORT_STATUSES: readonly CohortStatus[] = [
  CohortStatus.SCHEDULED,
  CohortStatus.ACTIVE,
];

function parseRange(
  startsAt: string | Date,
  endsAt: string | Date,
): { startsAt: Date; endsAt: Date } {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new BadRequestException('Dates must be valid ISO timestamps');
  }
  if (end.getTime() <= start.getTime()) {
    throw new BadRequestException('The end must be after the start');
  }
  return { startsAt: start, endsAt: end };
}

@Injectable()
export class CohortsService {
  private readonly joinPolicies: CohortJoinPolicy[] = [];

  constructor(
    @InjectRepository(Cohort) private readonly cohorts: Repository<Cohort>,
    @InjectRepository(CohortSession) private readonly sessions: Repository<CohortSession>,
    @InjectRepository(CohortMember) private readonly members: Repository<CohortMember>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly coursesService: CoursesService,
    private readonly usersService: UsersService,
  ) {}

  registerJoinPolicy(policy: CohortJoinPolicy): void {
    this.joinPolicies.push(policy);
  }

  async findByIdOrFail(
    id: string,
    relations: string[] = ['course', 'instructor'],
  ): Promise<Cohort> {
    const cohort = await this.cohorts.findOne({ where: { id }, relations });
    if (!cohort) {
      throw new NotFoundException(`Cohort ${id} was not found`);
    }
    return cohort;
  }

  /** Cohort instructors, course owners and staff may manage a cohort. */
  assertCanManage(actor: Pick<User, 'id' | 'role'>, cohort: Cohort): void {
    const ownsCourse = cohort.course?.instructorId === actor.id;
    if (isCourseStaff(actor) || cohort.instructorId === actor.id || ownsCourse) {
      return;
    }
    throw new ForbiddenException('You can only manage cohorts of your own courses');
  }

  async findManaged(actor: User, id: string): Promise<Cohort> {
    const cohort = await this.findByIdOrFail(id, ['course', 'instructor', 'sessions']);
    this.assertCanManage(actor, cohort);
    return cohort;
  }

  listManaged(actor: User, query: ListCohortsQueryDto): Promise<Paginated<Cohort>> {
    const builder = this.cohorts
      .createQueryBuilder('cohort')
      .leftJoinAndSelect('cohort.course', 'course')
      .leftJoinAndSelect('cohort.instructor', 'instructor');
    if (!isCourseStaff(actor)) {
      builder.andWhere('(cohort.instructorId = :actorId OR course.instructorId = :actorId)', {
        actorId: actor.id,
      });
    }
    this.applyFilters(builder, query);
    builder.orderBy('cohort.startsAt', 'DESC');
    return paginateQuery(builder, query);
  }

  listPublic(query: ListCohortsQueryDto): Promise<Paginated<Cohort>> {
    const builder = this.cohorts
      .createQueryBuilder('cohort')
      .innerJoinAndSelect('cohort.course', 'course', 'course.status = :published', {
        published: CourseStatus.PUBLISHED,
      })
      .leftJoinAndSelect('cohort.instructor', 'instructor')
      .andWhere('cohort.status IN (:...open)', { open: OPEN_COHORT_STATUSES });
    this.applyFilters(builder, query);
    builder.orderBy('cohort.startsAt', 'ASC');
    return paginateQuery(builder, query);
  }

  async findPublic(id: string): Promise<Cohort> {
    const cohort = await this.findByIdOrFail(id, ['course', 'instructor', 'sessions']);
    if (cohort.course?.status !== CourseStatus.PUBLISHED) {
      throw new NotFoundException(`Cohort ${id} was not found`);
    }
    return cohort;
  }

  async create(actor: User, courseId: string, dto: CreateCohortDto): Promise<Cohort> {
    const course = await this.coursesService.findByIdOrFail(courseId, []);
    this.coursesService.assertCanManage(actor, course);
    const range = parseRange(dto.startsAt, dto.endsAt);
    const instructorId = await this.resolveInstructor(actor, course.instructorId, dto.instructorId);
    const cohort = await this.cohorts.save(
      this.cohorts.create({
        courseId,
        title: dto.title.trim(),
        description: dto.description ?? null,
        ...range,
        timezone: dto.timezone ?? 'UTC',
        capacity: dto.capacity,
        status: CohortStatus.SCHEDULED,
        instructorId,
        enrolledCount: 0,
        waitlistCount: 0,
      }),
    );
    return this.findByIdOrFail(cohort.id);
  }

  async update(actor: User, id: string, dto: UpdateCohortDto): Promise<Cohort> {
    const cohort = await this.findByIdOrFail(id);
    this.assertCanManage(actor, cohort);
    const range = parseRange(dto.startsAt ?? cohort.startsAt, dto.endsAt ?? cohort.endsAt);
    if (dto.capacity !== undefined && dto.capacity < cohort.enrolledCount) {
      throw new BadRequestException(
        `Capacity cannot drop below the ${cohort.enrolledCount} learners already enrolled`,
      );
    }
    if (dto.instructorId !== undefined) {
      cohort.instructorId = await this.resolveInstructor(
        actor,
        cohort.course?.instructorId ?? cohort.instructorId,
        dto.instructorId,
      );
    }
    const { startsAt: _s, endsAt: _e, instructorId: _i, ...rest } = stripUndefined(dto);
    Object.assign(cohort, rest, range);
    if (dto.title !== undefined) {
      cohort.title = dto.title.trim();
    }
    await this.cohorts.save(cohort);
    return this.findByIdOrFail(id);
  }

  async cancel(actor: User, id: string): Promise<Cohort> {
    const cohort = await this.findByIdOrFail(id);
    this.assertCanManage(actor, cohort);
    cohort.status = CohortStatus.CANCELLED;
    return this.cohorts.save(cohort);
  }

  async remove(actor: User, id: string): Promise<void> {
    const cohort = await this.findByIdOrFail(id);
    this.assertCanManage(actor, cohort);
    const memberCount = await this.members.count({ where: { cohortId: id } });
    if (memberCount > 0) {
      throw new BadRequestException('Cohorts with members cannot be deleted, cancel them instead');
    }
    await this.cohorts.remove(cohort);
  }

  async roster(actor: User, cohortId: string): Promise<CohortMember[]> {
    const cohort = await this.findByIdOrFail(cohortId);
    this.assertCanManage(actor, cohort);
    return this.members.find({
      where: { cohortId },
      relations: { user: true },
      order: { status: 'ASC', waitlistPosition: 'ASC', joinedAt: 'ASC' },
    });
  }

  async addSession(actor: User, cohortId: string, dto: CreateSessionDto): Promise<CohortSession> {
    const cohort = await this.findByIdOrFail(cohortId);
    this.assertCanManage(actor, cohort);
    const range = parseRange(dto.startsAt, dto.endsAt);
    return this.sessions.save(
      this.sessions.create({
        cohortId,
        title: dto.title.trim(),
        description: dto.description ?? null,
        ...range,
        meetingUrl: dto.meetingUrl ?? null,
        recordingUrl: dto.recordingUrl ?? null,
      }),
    );
  }

  async updateSession(
    actor: User,
    sessionId: string,
    dto: UpdateSessionDto,
  ): Promise<CohortSession> {
    const session = await this.loadSession(actor, sessionId);
    const range = parseRange(dto.startsAt ?? session.startsAt, dto.endsAt ?? session.endsAt);
    const { startsAt: _s, endsAt: _e, ...rest } = stripUndefined(dto);
    Object.assign(session, rest, range);
    if (dto.title !== undefined) {
      session.title = dto.title.trim();
    }
    return this.sessions.save(session);
  }

  async removeSession(actor: User, sessionId: string): Promise<void> {
    const session = await this.loadSession(actor, sessionId);
    await this.sessions.remove(session);
  }

  async loadSession(actor: User, sessionId: string): Promise<CohortSession> {
    const session = await this.sessions.findOne({
      where: { id: sessionId },
      relations: { cohort: { course: true } },
    });
    if (!session?.cohort) {
      throw new NotFoundException(`Session ${sessionId} was not found`);
    }
    this.assertCanManage(actor, session.cohort);
    return session;
  }

  /**
   * Enrolls the learner or places them on the waitlist when the cohort is
   * full. The cohort row is locked so concurrent joins cannot oversubscribe.
   */
  async join(user: User, cohortId: string): Promise<CohortMember> {
    const cohort = await this.findByIdOrFail(cohortId);
    if (!OPEN_COHORT_STATUSES.includes(cohort.status)) {
      throw new BadRequestException('This cohort is not accepting learners');
    }
    if (cohort.course?.status !== CourseStatus.PUBLISHED) {
      throw new BadRequestException('The course of this cohort is not published');
    }
    for (const policy of this.joinPolicies) {
      await policy(user, cohort);
    }

    return this.dataSource.transaction(async (manager) => {
      const locked = await manager.findOne(Cohort, {
        where: { id: cohortId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) {
        throw new NotFoundException(`Cohort ${cohortId} was not found`);
      }
      const existing = await manager.findOne(CohortMember, {
        where: { cohortId, userId: user.id },
      });
      if (existing && existing.status !== CohortMemberStatus.DROPPED) {
        throw new ConflictException('You already belong to this cohort');
      }
      const hasSeat = locked.enrolledCount < locked.capacity;
      const member = existing ?? manager.create(CohortMember, { cohortId, userId: user.id });
      member.status = hasSeat ? CohortMemberStatus.ENROLLED : CohortMemberStatus.WAITLISTED;
      member.waitlistPosition = hasSeat ? null : locked.waitlistCount + 1;
      member.joinedAt = hasSeat ? new Date() : null;
      member.droppedAt = null;
      const saved = await manager.save(CohortMember, member);
      await manager.update(
        Cohort,
        { id: cohortId },
        hasSeat
          ? { enrolledCount: locked.enrolledCount + 1 }
          : { waitlistCount: locked.waitlistCount + 1 },
      );
      return saved;
    });
  }

  /** Drops the learner and promotes the first waitlisted learner if a seat frees up. */
  async leave(user: User, cohortId: string): Promise<CohortMember | null> {
    return this.dataSource.transaction(async (manager) => {
      const locked = await manager.findOne(Cohort, {
        where: { id: cohortId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) {
        throw new NotFoundException(`Cohort ${cohortId} was not found`);
      }
      const member = await manager.findOne(CohortMember, {
        where: { cohortId, userId: user.id },
      });
      if (!member || member.status === CohortMemberStatus.DROPPED) {
        throw new NotFoundException('You are not part of this cohort');
      }
      const wasEnrolled = member.status === CohortMemberStatus.ENROLLED;
      member.status = CohortMemberStatus.DROPPED;
      member.waitlistPosition = null;
      member.droppedAt = new Date();
      await manager.save(CohortMember, member);

      let promoted: CohortMember | null = null;
      let enrolledCount = locked.enrolledCount - (wasEnrolled ? 1 : 0);
      if (wasEnrolled) {
        promoted = await this.promoteNext(manager, cohortId);
        if (promoted) {
          enrolledCount += 1;
        }
      }
      const waitlistCount = await this.renumberWaitlist(manager, cohortId);
      await manager.update(Cohort, { id: cohortId }, { enrolledCount, waitlistCount });
      return promoted;
    });
  }

  async mine(user: User): Promise<CohortMember[]> {
    return this.members.find({
      where: {
        userId: user.id,
        status: In([CohortMemberStatus.ENROLLED, CohortMemberStatus.WAITLISTED]),
      },
      relations: { cohort: { course: true, instructor: true } },
      order: { createdAt: 'DESC' },
    });
  }

  async membership(userId: string, cohortId: string): Promise<CohortMember | null> {
    return this.members.findOne({ where: { userId, cohortId } });
  }

  async enrolledUserIds(cohortId: string): Promise<Set<string>> {
    const rows = await this.members.find({
      where: { cohortId, status: CohortMemberStatus.ENROLLED },
      select: { userId: true },
    });
    return new Set(rows.map((row) => row.userId));
  }

  private applyFilters(
    builder: ReturnType<Repository<Cohort>['createQueryBuilder']>,
    query: ListCohortsQueryDto,
  ): void {
    if (query.courseId) {
      builder.andWhere('cohort.courseId = :courseId', { courseId: query.courseId });
    }
    if (query.status) {
      builder.andWhere('cohort.status = :status', { status: query.status });
    }
    if (query.upcomingOnly) {
      builder.andWhere('cohort.endsAt > :now', { now: new Date() });
    }
  }

  private async resolveInstructor(
    actor: User,
    fallback: string,
    requested: string | undefined,
  ): Promise<string> {
    if (!requested) {
      return fallback;
    }
    if (requested !== actor.id && !isCourseStaff(actor)) {
      throw new ForbiddenException('Only admins can assign another instructor');
    }
    const instructor = await this.usersService.findByIdOrFail(requested);
    if (![UserRole.INSTRUCTOR, UserRole.ADMIN, UserRole.SUPERADMIN].includes(instructor.role)) {
      throw new BadRequestException('The assigned user is not an instructor');
    }
    return instructor.id;
  }

  private async promoteNext(
    manager: EntityManager,
    cohortId: string,
  ): Promise<CohortMember | null> {
    const next = await manager.findOne(CohortMember, {
      where: { cohortId, status: CohortMemberStatus.WAITLISTED },
      order: { waitlistPosition: 'ASC' },
      relations: { user: true },
    });
    if (!next) {
      return null;
    }
    next.status = CohortMemberStatus.ENROLLED;
    next.waitlistPosition = null;
    next.joinedAt = new Date();
    return manager.save(CohortMember, next);
  }

  private async renumberWaitlist(manager: EntityManager, cohortId: string): Promise<number> {
    const waiting = await manager.find(CohortMember, {
      where: { cohortId, status: CohortMemberStatus.WAITLISTED },
      order: { waitlistPosition: 'ASC', createdAt: 'ASC' },
    });
    await Promise.all(
      waiting.map((member, index) =>
        manager.update(CohortMember, { id: member.id }, { waitlistPosition: index + 1 }),
      ),
    );
    return waiting.length;
  }
}

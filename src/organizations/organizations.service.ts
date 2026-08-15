import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { In, IsNull, MoreThan, Repository } from 'typeorm';
import { UserRole } from '../common/enums/user-role.enum';
import { type Paginated, paginateQuery, paginateRepository } from '../common/pagination/pagination';
import { containsPattern } from '../common/utils/escape-like';
import { normalizeEmail } from '../common/utils/normalize-email';
import { uniqueSlug } from '../common/utils/slugify';
import { stripUndefined } from '../common/utils/strip-undefined';
import { appConfig } from '../config/configuration';
import { CoursesService } from '../courses/courses.service';
import { CourseStatus } from '../courses/enums/course.enums';
import { MailService } from '../mail/mail.service';
import { type User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import {
  AssignSeatDto,
  CreateOrganizationDto,
  GrantSeatPackDto,
  InviteMemberDto,
  ListMembersQueryDto,
  ListOrganizationsQueryDto,
  UpdateOrganizationDto,
} from './dto/organization.dto';
import { OrganizationInvitation } from './entities/organization-invitation.entity';
import { OrganizationMembership } from './entities/organization-membership.entity';
import { Organization } from './entities/organization.entity';
import { SeatAssignment } from './entities/seat-assignment.entity';
import { SeatPack } from './entities/seat-pack.entity';
import {
  InvitationStatus,
  OrganizationMemberRole,
  OrganizationStatus,
  SeatPackSource,
} from './enums/organization.enums';

export interface OrganizationContext {
  organization: Organization;
  membershipRole: OrganizationMemberRole | null;
  canManage: boolean;
}

export interface SeatSummary {
  totalSeats: number;
  usedSeats: number;
  availableSeats: number;
}

export interface OrganizationDashboard {
  organization: Organization;
  seats: SeatSummary;
  members: { total: number; admins: number };
  pendingInvitations: number;
  courses: { courseId: string; title: string; seatsUsed: number }[];
}

const INVITATION_TTL_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

function isPlatformStaff(user: Pick<User, 'role'>): boolean {
  return user.role === UserRole.ADMIN || user.role === UserRole.SUPERADMIN;
}

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization) private readonly organizations: Repository<Organization>,
    @InjectRepository(OrganizationMembership)
    private readonly memberships: Repository<OrganizationMembership>,
    @InjectRepository(SeatPack) private readonly seatPacks: Repository<SeatPack>,
    @InjectRepository(SeatAssignment) private readonly seatAssignments: Repository<SeatAssignment>,
    @InjectRepository(OrganizationInvitation)
    private readonly invitations: Repository<OrganizationInvitation>,
    private readonly usersService: UsersService,
    private readonly coursesService: CoursesService,
    private readonly mailService: MailService,
    @Inject(appConfig.KEY) private readonly app: ConfigType<typeof appConfig>,
  ) {}

  async findByIdOrFail(id: string): Promise<Organization> {
    const organization = await this.organizations.findOne({ where: { id } });
    if (!organization) {
      throw new NotFoundException(`Organization ${id} was not found`);
    }
    return organization;
  }

  /** Resolves what the actor may do with the organization. */
  async contextFor(actor: User, organizationId: string): Promise<OrganizationContext> {
    const organization = await this.findByIdOrFail(organizationId);
    const membership = await this.memberships.findOne({
      where: { organizationId, userId: actor.id },
    });
    const membershipRole = membership?.role ?? null;
    const canManage =
      isPlatformStaff(actor) ||
      organization.ownerId === actor.id ||
      membershipRole === OrganizationMemberRole.ADMIN;
    return { organization, membershipRole, canManage };
  }

  async requireManage(actor: User, organizationId: string): Promise<Organization> {
    const context = await this.contextFor(actor, organizationId);
    if (!context.canManage) {
      throw new ForbiddenException('You do not manage this organization');
    }
    return context.organization;
  }

  async requireView(actor: User, organizationId: string): Promise<OrganizationContext> {
    const context = await this.contextFor(actor, organizationId);
    if (!context.canManage && !context.membershipRole) {
      throw new ForbiddenException('You are not a member of this organization');
    }
    return context;
  }

  list(query: ListOrganizationsQueryDto): Promise<Paginated<Organization>> {
    const builder = this.organizations.createQueryBuilder('organization');
    if (query.search) {
      builder.andWhere('organization.name ILIKE :search', {
        search: containsPattern(query.search),
      });
    }
    if (query.status) {
      builder.andWhere('organization.status = :status', { status: query.status });
    }
    builder.orderBy('organization.createdAt', 'DESC');
    return paginateQuery(builder, query);
  }

  async listMine(
    actor: User,
  ): Promise<{ organization: Organization; role: OrganizationMemberRole }[]> {
    const memberships = await this.memberships.find({
      where: { userId: actor.id },
      relations: { organization: true },
      order: { createdAt: 'ASC' },
    });
    return memberships
      .filter((membership) => membership.organization)
      .map((membership) => ({ organization: membership.organization!, role: membership.role }));
  }

  async create(actor: User, dto: CreateOrganizationDto): Promise<Organization> {
    const owner = dto.ownerId ? await this.usersService.findByIdOrFail(dto.ownerId) : actor;
    const slug = await uniqueSlug(dto.name, (candidate) =>
      this.organizations.exists({ where: { slug: candidate } }),
    );
    const organization = await this.organizations.save(
      this.organizations.create({
        name: dto.name.trim(),
        slug,
        description: dto.description ?? null,
        website: dto.website ?? null,
        logoUrl: dto.logoUrl ?? null,
        status: OrganizationStatus.ACTIVE,
        ownerId: owner.id,
      }),
    );
    await this.memberships.save(
      this.memberships.create({
        organizationId: organization.id,
        userId: owner.id,
        role: OrganizationMemberRole.ADMIN,
      }),
    );
    await this.promoteToOrgAdmin(owner);
    return organization;
  }

  async update(actor: User, id: string, dto: UpdateOrganizationDto): Promise<Organization> {
    const organization = await this.requireManage(actor, id);
    Object.assign(organization, stripUndefined(dto));
    if (dto.name !== undefined) {
      organization.name = dto.name.trim();
    }
    return this.organizations.save(organization);
  }

  async setStatus(id: string, status: OrganizationStatus): Promise<Organization> {
    const organization = await this.findByIdOrFail(id);
    organization.status = status;
    return this.organizations.save(organization);
  }

  async members(
    actor: User,
    organizationId: string,
    query: ListMembersQueryDto,
  ): Promise<Paginated<OrganizationMembership>> {
    await this.requireManage(actor, organizationId);
    return paginateRepository(
      this.memberships,
      {
        where: { organizationId, ...(query.role ? { role: query.role } : {}) },
        relations: { user: true },
        order: { createdAt: 'ASC' },
      },
      query,
    );
  }

  async removeMember(actor: User, organizationId: string, userId: string): Promise<void> {
    const organization = await this.requireManage(actor, organizationId);
    if (organization.ownerId === userId) {
      throw new BadRequestException('The owner cannot be removed from the organization');
    }
    const membership = await this.memberships.findOne({ where: { organizationId, userId } });
    if (!membership) {
      throw new NotFoundException('The user is not a member of this organization');
    }
    await this.memberships.remove(membership);
    await this.seatAssignments.update(
      { organizationId, userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  async grantSeatPack(
    organizationId: string,
    dto: GrantSeatPackDto,
    source: SeatPackSource = SeatPackSource.MANUAL,
    purchaseId: string | null = null,
  ): Promise<SeatPack> {
    await this.findByIdOrFail(organizationId);
    return this.seatPacks.save(
      this.seatPacks.create({
        organizationId,
        seats: dto.seats,
        source,
        purchaseId,
        note: dto.note ?? null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      }),
    );
  }

  /** Removes seat packs that came from a purchase which was later refunded. */
  async removeSeatPacksByPurchase(purchaseId: string): Promise<number> {
    const result = await this.seatPacks.delete({ purchaseId });
    return result.affected ?? 0;
  }

  async listSeatPacks(actor: User, organizationId: string): Promise<SeatPack[]> {
    await this.requireManage(actor, organizationId);
    return this.seatPacks.find({ where: { organizationId }, order: { createdAt: 'DESC' } });
  }

  async seatSummary(organizationId: string): Promise<SeatSummary> {
    const now = new Date();
    const [packs, usedSeats] = await Promise.all([
      this.seatPacks.find({
        where: [
          { organizationId, expiresAt: IsNull() },
          { organizationId, expiresAt: MoreThan(now) },
        ],
      }),
      this.seatAssignments.count({ where: { organizationId, revokedAt: IsNull() } }),
    ]);
    const totalSeats = packs.reduce((sum, pack) => sum + pack.seats, 0);
    return { totalSeats, usedSeats, availableSeats: Math.max(0, totalSeats - usedSeats) };
  }

  async invite(
    actor: User,
    organizationId: string,
    dto: InviteMemberDto,
  ): Promise<{ invitation: OrganizationInvitation; token: string }> {
    const organization = await this.requireManage(actor, organizationId);
    const email = normalizeEmail(dto.email);
    const existingUser = await this.usersService.findByEmail(email);
    if (existingUser) {
      const member = await this.memberships.exists({
        where: { organizationId, userId: existingUser.id },
      });
      if (member) {
        throw new ConflictException('This person is already a member');
      }
    }
    await this.invitations.update(
      { organizationId, email, status: InvitationStatus.PENDING },
      { status: InvitationStatus.REVOKED },
    );
    const token = randomBytes(32).toString('base64url');
    const invitation = await this.invitations.save(
      this.invitations.create({
        organizationId,
        email,
        role: dto.role ?? OrganizationMemberRole.MEMBER,
        tokenHash: this.hashToken(token),
        invitedById: actor.id,
        status: InvitationStatus.PENDING,
        expiresAt: new Date(Date.now() + INVITATION_TTL_DAYS * DAY_MS),
        acceptedAt: null,
      }),
    );
    const acceptUrl = `${this.app.url}/organizations/invitations/accept?token=${token}`;
    await this.mailService.sendOrganizationInvite(
      email,
      organization.name,
      `${actor.firstName} ${actor.lastName}`.trim(),
      acceptUrl,
      INVITATION_TTL_DAYS,
    );
    return { invitation, token };
  }

  async listInvitations(actor: User, organizationId: string): Promise<OrganizationInvitation[]> {
    await this.requireManage(actor, organizationId);
    return this.invitations.find({ where: { organizationId }, order: { createdAt: 'DESC' } });
  }

  async revokeInvitation(actor: User, organizationId: string, invitationId: string): Promise<void> {
    await this.requireManage(actor, organizationId);
    const result = await this.invitations.update(
      { id: invitationId, organizationId, status: InvitationStatus.PENDING },
      { status: InvitationStatus.REVOKED },
    );
    if (!result.affected) {
      throw new NotFoundException('No pending invitation with that id');
    }
  }

  async acceptInvitation(actor: User, token: string): Promise<OrganizationMembership> {
    const invitation = await this.invitations.findOne({
      where: { tokenHash: this.hashToken(token) },
    });
    if (!invitation || !invitation.isPending) {
      throw new BadRequestException('The invitation is invalid or has expired');
    }
    if (invitation.email !== normalizeEmail(actor.email)) {
      throw new ForbiddenException('This invitation was sent to a different email address');
    }
    let membership = await this.memberships.findOne({
      where: { organizationId: invitation.organizationId, userId: actor.id },
    });
    if (!membership) {
      membership = await this.memberships.save(
        this.memberships.create({
          organizationId: invitation.organizationId,
          userId: actor.id,
          role: invitation.role,
        }),
      );
    }
    invitation.status = InvitationStatus.ACCEPTED;
    invitation.acceptedAt = new Date();
    await this.invitations.save(invitation);
    if (invitation.role === OrganizationMemberRole.ADMIN) {
      await this.promoteToOrgAdmin(actor);
    }
    return membership;
  }

  async assignSeat(
    actor: User,
    organizationId: string,
    dto: AssignSeatDto,
  ): Promise<SeatAssignment> {
    await this.requireManage(actor, organizationId);
    const isMember = await this.memberships.exists({
      where: { organizationId, userId: dto.userId },
    });
    if (!isMember) {
      throw new BadRequestException('Seats can only be assigned to organization members');
    }
    const course = await this.coursesService.findByIdOrFail(dto.courseId, []);
    if (course.status !== CourseStatus.PUBLISHED) {
      throw new BadRequestException('Seats can only be assigned to published courses');
    }
    const existing = await this.seatAssignments.exists({
      where: { organizationId, userId: dto.userId, courseId: dto.courseId, revokedAt: IsNull() },
    });
    if (existing) {
      throw new ConflictException('This member already holds a seat for the course');
    }
    const summary = await this.seatSummary(organizationId);
    if (summary.availableSeats <= 0) {
      throw new BadRequestException('No seats available. Purchase a seat pack to add more.');
    }
    await this.seatAssignments.delete({
      organizationId,
      userId: dto.userId,
      courseId: dto.courseId,
    });
    const assignment = await this.seatAssignments.save(
      this.seatAssignments.create({
        organizationId,
        userId: dto.userId,
        courseId: dto.courseId,
        assignedById: actor.id,
        revokedAt: null,
      }),
    );
    return this.loadAssignment(assignment.id);
  }

  async revokeSeat(actor: User, organizationId: string, assignmentId: string): Promise<void> {
    await this.requireManage(actor, organizationId);
    const result = await this.seatAssignments.update(
      { id: assignmentId, organizationId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    if (!result.affected) {
      throw new NotFoundException('No active seat assignment with that id');
    }
  }

  async listSeatAssignments(actor: User, organizationId: string): Promise<SeatAssignment[]> {
    await this.requireManage(actor, organizationId);
    return this.seatAssignments.find({
      where: { organizationId, revokedAt: IsNull() },
      relations: { user: true, course: true },
      order: { createdAt: 'DESC' },
    });
  }

  /** Used by enrollments to decide whether a learner may join a course for free. */
  async findActiveSeat(userId: string, courseId: string): Promise<SeatAssignment | null> {
    return this.seatAssignments.findOne({
      where: { userId, courseId, revokedAt: IsNull() },
      relations: { organization: true },
    });
  }

  async dashboard(actor: User, organizationId: string): Promise<OrganizationDashboard> {
    const organization = await this.requireManage(actor, organizationId);
    const [seats, total, admins, pendingInvitations, courseRows] = await Promise.all([
      this.seatSummary(organizationId),
      this.memberships.count({ where: { organizationId } }),
      this.memberships.count({ where: { organizationId, role: OrganizationMemberRole.ADMIN } }),
      this.invitations.count({
        where: {
          organizationId,
          status: InvitationStatus.PENDING,
          expiresAt: MoreThan(new Date()),
        },
      }),
      this.seatAssignments
        .createQueryBuilder('assignment')
        .innerJoin('assignment.course', 'course')
        .select('course.id', 'courseId')
        .addSelect('course.title', 'title')
        .addSelect('COUNT(*)', 'seatsUsed')
        .where('assignment.organizationId = :organizationId', { organizationId })
        .andWhere('assignment.revokedAt IS NULL')
        .groupBy('course.id')
        .addGroupBy('course.title')
        .orderBy('COUNT(*)', 'DESC')
        .getRawMany<{ courseId: string; title: string; seatsUsed: string }>(),
    ]);
    return {
      organization,
      seats,
      members: { total, admins },
      pendingInvitations,
      courses: courseRows.map((row) => ({
        courseId: row.courseId,
        title: row.title,
        seatsUsed: Number(row.seatsUsed),
      })),
    };
  }

  async loadAssignment(id: string): Promise<SeatAssignment> {
    const assignment = await this.seatAssignments.findOne({
      where: { id },
      relations: { user: true, course: true },
    });
    if (!assignment) {
      throw new NotFoundException(`Seat assignment ${id} was not found`);
    }
    return assignment;
  }

  async membershipsFor(
    userId: string,
    organizationIds: string[],
  ): Promise<OrganizationMembership[]> {
    if (organizationIds.length === 0) {
      return [];
    }
    return this.memberships.find({ where: { userId, organizationId: In(organizationIds) } });
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async promoteToOrgAdmin(user: Pick<User, 'id' | 'role'>): Promise<void> {
    if (user.role === UserRole.LEARNER) {
      await this.usersService.changeRole(user.id, UserRole.ORG_ADMIN);
    }
  }
}

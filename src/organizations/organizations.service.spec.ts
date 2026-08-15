import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserRole } from '../common/enums/user-role.enum';
import { appConfig } from '../config/configuration';
import { CoursesService } from '../courses/courses.service';
import { CourseStatus } from '../courses/enums/course.enums';
import { MailService } from '../mail/mail.service';
import { type User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { OrganizationInvitation } from './entities/organization-invitation.entity';
import { OrganizationMembership } from './entities/organization-membership.entity';
import { Organization } from './entities/organization.entity';
import { SeatAssignment } from './entities/seat-assignment.entity';
import { SeatPack } from './entities/seat-pack.entity';
import {
  InvitationStatus,
  OrganizationMemberRole,
  SeatPackSource,
} from './enums/organization.enums';
import { OrganizationsService } from './organizations.service';

const admin = {
  id: 'admin',
  role: UserRole.ADMIN,
  email: 'admin@x.test',
  firstName: 'A',
  lastName: 'D',
} as User;
const owner = {
  id: 'owner',
  role: UserRole.LEARNER,
  email: 'owner@x.test',
  firstName: 'O',
  lastName: 'W',
} as User;
const learner = {
  id: 'learner',
  role: UserRole.LEARNER,
  email: 'lea@x.test',
  firstName: 'L',
  lastName: 'E',
} as User;
const organization = { id: 'org-1', name: 'Acme', ownerId: 'owner' } as Organization;

function repositoryMock(): Record<string, jest.Mock> {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    exists: jest.fn().mockResolvedValue(false),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn((value: object) => value),
    save: jest.fn((value: object) =>
      Promise.resolve({ id: 'new-id', createdAt: new Date(), ...value }),
    ),
    remove: jest.fn(),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
}

describe('OrganizationsService', () => {
  let service: OrganizationsService;
  const organizations = repositoryMock();
  const memberships = repositoryMock();
  const seatPacks = repositoryMock();
  const seatAssignments = repositoryMock();
  const invitations = repositoryMock();
  const usersService = { findByIdOrFail: jest.fn(), findByEmail: jest.fn(), changeRole: jest.fn() };
  const coursesService = { findByIdOrFail: jest.fn() };
  const mailService = { sendOrganizationInvite: jest.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    jest.clearAllMocks();
    organizations.findOne.mockResolvedValue(organization);
    organizations.exists.mockResolvedValue(false);
    memberships.findOne.mockResolvedValue(null);
    memberships.exists.mockResolvedValue(false);
    seatAssignments.exists.mockResolvedValue(false);
    seatAssignments.count.mockResolvedValue(0);
    seatAssignments.update.mockResolvedValue({ affected: 1 });
    seatPacks.find.mockResolvedValue([]);
    usersService.findByEmail.mockResolvedValue(null);
    const moduleRef = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        { provide: getRepositoryToken(Organization), useValue: organizations },
        { provide: getRepositoryToken(OrganizationMembership), useValue: memberships },
        { provide: getRepositoryToken(SeatPack), useValue: seatPacks },
        { provide: getRepositoryToken(SeatAssignment), useValue: seatAssignments },
        { provide: getRepositoryToken(OrganizationInvitation), useValue: invitations },
        { provide: UsersService, useValue: usersService },
        { provide: CoursesService, useValue: coursesService },
        { provide: MailService, useValue: mailService },
        { provide: appConfig.KEY, useValue: { url: 'https://app.test', name: 'Cohortly' } },
      ],
    }).compile();
    service = moduleRef.get(OrganizationsService);
  });

  describe('access context', () => {
    it('lets platform staff, owners and org admins manage', async () => {
      await expect(service.contextFor(admin, 'org-1')).resolves.toMatchObject({ canManage: true });
      await expect(service.contextFor(owner, 'org-1')).resolves.toMatchObject({ canManage: true });

      memberships.findOne.mockResolvedValueOnce({ role: OrganizationMemberRole.ADMIN });
      await expect(service.contextFor(learner, 'org-1')).resolves.toMatchObject({
        canManage: true,
        membershipRole: OrganizationMemberRole.ADMIN,
      });
    });

    it('gives members view access only and rejects strangers', async () => {
      memberships.findOne.mockResolvedValueOnce({ role: OrganizationMemberRole.MEMBER });
      await expect(service.requireView(learner, 'org-1')).resolves.toMatchObject({
        canManage: false,
      });

      await expect(service.requireManage(learner, 'org-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(service.requireView(learner, 'org-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  it('creates an organization, an admin membership and promotes a learner owner', async () => {
    usersService.findByIdOrFail.mockResolvedValue(owner);

    const created = await service.create(admin, { name: ' Acme Corp ', ownerId: 'owner' });

    expect(created).toMatchObject({ name: 'Acme Corp', slug: 'acme-corp', ownerId: 'owner' });
    expect(memberships.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'owner', role: OrganizationMemberRole.ADMIN }),
    );
    expect(usersService.changeRole).toHaveBeenCalledWith('owner', UserRole.ORG_ADMIN);
  });

  it('computes seat availability from unexpired packs and active assignments', async () => {
    seatPacks.find.mockResolvedValue([{ seats: 5 }, { seats: 3 }]);
    seatAssignments.count.mockResolvedValue(6);

    await expect(service.seatSummary('org-1')).resolves.toEqual({
      totalSeats: 8,
      usedSeats: 6,
      availableSeats: 2,
    });
  });

  it('grants seat packs with a source and optional expiry', async () => {
    const pack = await service.grantSeatPack('org-1', { seats: 10, expiresAt: '2030-01-01' });

    expect(pack).toMatchObject({ seats: 10, source: SeatPackSource.MANUAL, purchaseId: null });
    expect(pack.expiresAt).toBeInstanceOf(Date);
  });

  describe('invitations', () => {
    it('emails a tokenised invitation and revokes older pending ones', async () => {
      const result = await service.invite(owner, 'org-1', { email: 'New@X.test' });

      expect(invitations.update).toHaveBeenCalledWith(
        { organizationId: 'org-1', email: 'new@x.test', status: InvitationStatus.PENDING },
        { status: InvitationStatus.REVOKED },
      );
      expect(result.invitation).toMatchObject({
        email: 'new@x.test',
        role: OrganizationMemberRole.MEMBER,
      });
      expect(result.invitation.tokenHash).not.toBe(result.token);
      expect(mailService.sendOrganizationInvite).toHaveBeenCalledWith(
        'new@x.test',
        'Acme',
        'O W',
        expect.stringContaining(`token=${result.token}`),
        7,
      );
    });

    it('refuses to invite existing members', async () => {
      usersService.findByEmail.mockResolvedValue(learner);
      memberships.exists.mockResolvedValue(true);

      await expect(service.invite(owner, 'org-1', { email: learner.email })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('accepts a valid invitation for the matching email only', async () => {
      invitations.findOne.mockResolvedValue({
        organizationId: 'org-1',
        email: 'lea@x.test',
        role: OrganizationMemberRole.MEMBER,
        status: InvitationStatus.PENDING,
        isPending: true,
      });

      await expect(service.acceptInvitation(owner, 'token')).rejects.toBeInstanceOf(
        ForbiddenException,
      );

      const membership = await service.acceptInvitation(learner, 'token');
      expect(membership).toMatchObject({ organizationId: 'org-1', userId: 'learner' });
      expect(invitations.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: InvitationStatus.ACCEPTED }),
      );
    });

    it('rejects unknown or expired invitations', async () => {
      invitations.findOne.mockResolvedValueOnce(null);
      await expect(service.acceptInvitation(learner, 'nope')).rejects.toBeInstanceOf(
        BadRequestException,
      );

      invitations.findOne.mockResolvedValueOnce({ isPending: false, email: 'lea@x.test' });
      await expect(service.acceptInvitation(learner, 'old')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('promotes learners who accept an admin invitation', async () => {
      invitations.findOne.mockResolvedValue({
        organizationId: 'org-1',
        email: 'lea@x.test',
        role: OrganizationMemberRole.ADMIN,
        isPending: true,
      });

      await service.acceptInvitation(learner, 'token');

      expect(usersService.changeRole).toHaveBeenCalledWith('learner', UserRole.ORG_ADMIN);
    });
  });

  describe('seats', () => {
    beforeEach(() => {
      memberships.exists.mockResolvedValue(true);
      coursesService.findByIdOrFail.mockResolvedValue({ id: 'c1', status: CourseStatus.PUBLISHED });
      seatPacks.find.mockResolvedValue([{ seats: 1 }]);
      seatAssignments.findOne.mockResolvedValue({
        id: 'new-id',
        userId: 'learner',
        courseId: 'c1',
      });
    });

    it('assigns a seat to a member for a published course', async () => {
      const assignment = await service.assignSeat(owner, 'org-1', {
        userId: 'learner',
        courseId: 'c1',
      });

      expect(seatAssignments.save).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'learner', courseId: 'c1', assignedById: 'owner' }),
      );
      expect(assignment.id).toBe('new-id');
    });

    it('requires membership, a published course, a free seat and no duplicate', async () => {
      memberships.exists.mockResolvedValueOnce(false);
      await expect(
        service.assignSeat(owner, 'org-1', { userId: 'x', courseId: 'c1' }),
      ).rejects.toBeInstanceOf(BadRequestException);

      coursesService.findByIdOrFail.mockResolvedValueOnce({ id: 'c1', status: CourseStatus.DRAFT });
      await expect(
        service.assignSeat(owner, 'org-1', { userId: 'learner', courseId: 'c1' }),
      ).rejects.toThrow('published');

      seatAssignments.exists.mockResolvedValueOnce(true);
      await expect(
        service.assignSeat(owner, 'org-1', { userId: 'learner', courseId: 'c1' }),
      ).rejects.toBeInstanceOf(ConflictException);

      seatAssignments.count.mockResolvedValueOnce(1);
      await expect(
        service.assignSeat(owner, 'org-1', { userId: 'learner', courseId: 'c1' }),
      ).rejects.toThrow('No seats available');
    });

    it('revokes seats and fails when nothing was active', async () => {
      await service.revokeSeat(owner, 'org-1', 'a1');
      expect(seatAssignments.update).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }), {
        revokedAt: expect.any(Date) as Date,
      });

      seatAssignments.update.mockResolvedValueOnce({ affected: 0 });
      await expect(service.revokeSeat(owner, 'org-1', 'a1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  it('removes members but never the owner, revoking their seats', async () => {
    await expect(service.removeMember(owner, 'org-1', 'owner')).rejects.toBeInstanceOf(
      BadRequestException,
    );

    memberships.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'm1' });
    await service.removeMember(owner, 'org-1', 'learner');
    expect(memberships.remove).toHaveBeenCalledWith({ id: 'm1' });
    expect(seatAssignments.update).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'learner' }),
      { revokedAt: expect.any(Date) as Date },
    );
  });

  it('builds the dashboard from seat usage and membership counts', async () => {
    seatPacks.find.mockResolvedValue([{ seats: 4 }]);
    seatAssignments.count.mockResolvedValue(1);
    memberships.count.mockResolvedValueOnce(3).mockResolvedValueOnce(1);
    invitations.count.mockResolvedValue(2);
    const builder = {
      innerJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      addGroupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([{ courseId: 'c1', title: 'TS', seatsUsed: '1' }]),
    };
    seatAssignments.createQueryBuilder.mockReturnValue(builder);

    const dashboard = await service.dashboard(owner, 'org-1');

    expect(dashboard.seats).toEqual({ totalSeats: 4, usedSeats: 1, availableSeats: 3 });
    expect(dashboard.members).toEqual({ total: 3, admins: 1 });
    expect(dashboard.pendingInvitations).toBe(2);
    expect(dashboard.courses).toEqual([{ courseId: 'c1', title: 'TS', seatsUsed: 1 }]);
  });
});

describe('OrganizationsService purchased seat packs', () => {
  it('removes every seat pack that came from a refunded purchase', async () => {
    const seatPacks = { delete: jest.fn().mockResolvedValue({ affected: 2 }) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        { provide: getRepositoryToken(Organization), useValue: {} },
        { provide: getRepositoryToken(OrganizationMembership), useValue: {} },
        { provide: getRepositoryToken(SeatPack), useValue: seatPacks },
        { provide: getRepositoryToken(SeatAssignment), useValue: {} },
        { provide: getRepositoryToken(OrganizationInvitation), useValue: {} },
        { provide: UsersService, useValue: {} },
        { provide: CoursesService, useValue: {} },
        { provide: MailService, useValue: {} },
        { provide: appConfig.KEY, useValue: { url: 'https://app.test', name: 'Cohortly' } },
      ],
    }).compile();
    const service = moduleRef.get(OrganizationsService);

    await expect(service.removeSeatPacksByPurchase('p1')).resolves.toBe(2);
    expect(seatPacks.delete).toHaveBeenCalledWith({ purchaseId: 'p1' });
  });
});

import { Test } from '@nestjs/testing';
import { UserRole } from '../common/enums/user-role.enum';
import { type User } from '../users/entities/user.entity';
import { OrganizationMemberRole, OrganizationStatus } from './enums/organization.enums';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

const actor = { id: 'owner', role: UserRole.ORG_ADMIN } as User;
const organization = {
  id: 'org-1',
  name: 'Acme',
  slug: 'acme',
  description: null,
  website: null,
  logoUrl: null,
  status: OrganizationStatus.ACTIVE,
  ownerId: 'owner',
  createdAt: new Date(),
};
const membership = {
  id: 'm1',
  organizationId: 'org-1',
  role: OrganizationMemberRole.MEMBER,
  createdAt: new Date(),
  user: { id: 'u1', email: 'u@x.test', firstName: 'U', lastName: 'One', avatarUrl: null },
};
const invitation = {
  id: 'i1',
  organizationId: 'org-1',
  email: 'a@b.c',
  role: OrganizationMemberRole.MEMBER,
  status: 'PENDING',
  expiresAt: new Date(),
  acceptedAt: null,
  createdAt: new Date(),
  tokenHash: 'hash',
};

describe('OrganizationsController', () => {
  let controller: OrganizationsController;
  const organizationsService = {
    create: jest.fn().mockResolvedValue(organization),
    list: jest.fn().mockResolvedValue({ items: [organization], meta: { total: 1 } }),
    listMine: jest.fn().mockResolvedValue([{ organization, role: OrganizationMemberRole.ADMIN }]),
    acceptInvitation: jest.fn().mockResolvedValue(membership),
    requireView: jest.fn().mockResolvedValue({
      organization,
      membershipRole: OrganizationMemberRole.ADMIN,
      canManage: true,
    }),
    update: jest.fn().mockResolvedValue({ ...organization, name: 'Renamed' }),
    dashboard: jest.fn().mockResolvedValue({
      organization,
      seats: { totalSeats: 1, usedSeats: 0, availableSeats: 1 },
      members: { total: 1, admins: 1 },
      pendingInvitations: 0,
      courses: [],
    }),
    grantSeatPack: jest.fn().mockResolvedValue({
      id: 'p1',
      seats: 5,
      source: 'MANUAL',
      note: null,
      expiresAt: null,
      createdAt: new Date(),
    }),
    listSeatPacks: jest.fn().mockResolvedValue([]),
    members: jest.fn().mockResolvedValue({ items: [membership], meta: { total: 1 } }),
    removeMember: jest.fn(),
    invite: jest.fn().mockResolvedValue({ invitation, token: 'secret' }),
    listInvitations: jest.fn().mockResolvedValue([]),
    revokeInvitation: jest.fn(),
    assignSeat: jest.fn().mockResolvedValue({
      id: 'a1',
      organizationId: 'org-1',
      user: null,
      course: null,
      assignedById: 'owner',
      revokedAt: null,
      createdAt: new Date(),
    }),
    listSeatAssignments: jest.fn().mockResolvedValue([]),
    revokeSeat: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [OrganizationsController],
      providers: [{ provide: OrganizationsService, useValue: organizationsService }],
    }).compile();
    controller = moduleRef.get(OrganizationsController);
  });

  it('creates, lists and exposes the organizations of the actor', async () => {
    const created = await controller.create(actor, { name: 'Acme' });
    expect(created).toMatchObject({ id: 'org-1', slug: 'acme' });

    const page = await controller.list({ page: 1, limit: 20 });
    expect(page.items).toHaveLength(1);

    const mine = await controller.mine(actor);
    expect(mine[0]).toMatchObject({ role: OrganizationMemberRole.ADMIN });
  });

  it('returns the view context and dashboard', async () => {
    const view = await controller.findOne(actor, 'org-1');
    expect(view).toMatchObject({ canManage: true, membershipRole: OrganizationMemberRole.ADMIN });

    const dashboard = await controller.dashboard(actor, 'org-1');
    expect(dashboard.seats.availableSeats).toBe(1);
    expect(dashboard.organization.id).toBe('org-1');
  });

  it('never leaks the invitation token in the response', async () => {
    const result = await controller.invite(actor, 'org-1', { email: 'a@b.c' });

    expect(result).not.toHaveProperty('token');
    expect(result).not.toHaveProperty('tokenHash');
    expect(result.email).toBe('a@b.c');
  });

  it('accepts invitations and manages members and seats through the service', async () => {
    const accepted = await controller.acceptInvitation(actor, { token: 'x'.repeat(40) });
    expect(accepted.user?.fullName).toBe('U One');

    await controller.removeMember(actor, 'org-1', 'u1');
    expect(organizationsService.removeMember).toHaveBeenCalledWith(actor, 'org-1', 'u1');

    const pack = await controller.grantSeatPack('org-1', { seats: 5 });
    expect(pack.seats).toBe(5);

    const seat = await controller.assignSeat(actor, 'org-1', { userId: 'u1', courseId: 'c1' });
    expect(seat.id).toBe('a1');

    await controller.revokeSeat(actor, 'org-1', 'a1');
    expect(organizationsService.revokeSeat).toHaveBeenCalledWith(actor, 'org-1', 'a1');

    await controller.revokeInvitation(actor, 'org-1', 'i1');
    expect(organizationsService.revokeInvitation).toHaveBeenCalledWith(actor, 'org-1', 'i1');
  });
});

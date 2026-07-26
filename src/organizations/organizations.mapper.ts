import { type Course } from '../courses/entities/course.entity';
import { type User } from '../users/entities/user.entity';
import { type OrganizationInvitation } from './entities/organization-invitation.entity';
import { type OrganizationMembership } from './entities/organization-membership.entity';
import { type Organization } from './entities/organization.entity';
import { type SeatAssignment } from './entities/seat-assignment.entity';
import { type SeatPack } from './entities/seat-pack.entity';
import {
  type InvitationStatus,
  type OrganizationMemberRole,
  type OrganizationStatus,
  type SeatPackSource,
} from './enums/organization.enums';

export interface OrganizationDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  website: string | null;
  logoUrl: string | null;
  status: OrganizationStatus;
  ownerId: string;
  createdAt: Date;
}

export interface MemberSummaryDto {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
}

export interface MembershipDto {
  id: string;
  organizationId: string;
  role: OrganizationMemberRole;
  user: MemberSummaryDto | null;
  joinedAt: Date;
}

export interface InvitationDto {
  id: string;
  organizationId: string;
  email: string;
  role: OrganizationMemberRole;
  status: InvitationStatus;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
}

export interface SeatPackDto {
  id: string;
  seats: number;
  source: SeatPackSource;
  note: string | null;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface SeatAssignmentDto {
  id: string;
  organizationId: string;
  user: MemberSummaryDto | null;
  course: { id: string; title: string; slug: string } | null;
  assignedById: string;
  revokedAt: Date | null;
  createdAt: Date;
}

export function toMemberSummary(user: User | null | undefined): MemberSummaryDto | null {
  return user
    ? {
        id: user.id,
        email: user.email,
        fullName: `${user.firstName} ${user.lastName}`.trim(),
        avatarUrl: user.avatarUrl,
      }
    : null;
}

export function toOrganizationDto(organization: Organization): OrganizationDto {
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    description: organization.description,
    website: organization.website,
    logoUrl: organization.logoUrl,
    status: organization.status,
    ownerId: organization.ownerId,
    createdAt: organization.createdAt,
  };
}

export function toMembershipDto(membership: OrganizationMembership): MembershipDto {
  return {
    id: membership.id,
    organizationId: membership.organizationId,
    role: membership.role,
    user: toMemberSummary(membership.user),
    joinedAt: membership.createdAt,
  };
}

export function toInvitationDto(invitation: OrganizationInvitation): InvitationDto {
  return {
    id: invitation.id,
    organizationId: invitation.organizationId,
    email: invitation.email,
    role: invitation.role,
    status: invitation.status,
    expiresAt: invitation.expiresAt,
    acceptedAt: invitation.acceptedAt,
    createdAt: invitation.createdAt,
  };
}

export function toSeatPackDto(pack: SeatPack): SeatPackDto {
  return {
    id: pack.id,
    seats: pack.seats,
    source: pack.source,
    note: pack.note,
    expiresAt: pack.expiresAt,
    createdAt: pack.createdAt,
  };
}

function toCourseRef(course: Course | undefined): SeatAssignmentDto['course'] {
  return course ? { id: course.id, title: course.title, slug: course.slug } : null;
}

export function toSeatAssignmentDto(assignment: SeatAssignment): SeatAssignmentDto {
  return {
    id: assignment.id,
    organizationId: assignment.organizationId,
    user: toMemberSummary(assignment.user),
    course: toCourseRef(assignment.course),
    assignedById: assignment.assignedById,
    revokedAt: assignment.revokedAt,
    createdAt: assignment.createdAt,
  };
}

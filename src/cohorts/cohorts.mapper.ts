import { type User } from '../users/entities/user.entity';
import { type CohortMember } from './entities/cohort-member.entity';
import { type CohortSession } from './entities/cohort-session.entity';
import { type Cohort } from './entities/cohort.entity';
import { type SessionAttendance } from './entities/session-attendance.entity';
import {
  type AttendanceStatus,
  type CohortMemberStatus,
  type CohortStatus,
} from './enums/cohort.enums';

export interface PersonSummaryDto {
  id: string;
  fullName: string;
  email?: string;
  avatarUrl: string | null;
}

export interface SessionDto {
  id: string;
  cohortId: string;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date;
  meetingUrl: string | null;
  recordingUrl: string | null;
}

export interface CohortDto {
  id: string;
  course: { id: string; title: string; slug: string } | null;
  courseId: string;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  capacity: number;
  enrolledCount: number;
  waitlistCount: number;
  seatsLeft: number;
  status: CohortStatus;
  instructor: PersonSummaryDto | null;
  sessions?: SessionDto[];
  createdAt: Date;
}

export interface CohortMemberDto {
  id: string;
  cohortId: string;
  status: CohortMemberStatus;
  waitlistPosition: number | null;
  joinedAt: Date | null;
  user: PersonSummaryDto | null;
  cohort?: CohortDto;
}

export interface AttendanceDto {
  id: string;
  sessionId: string;
  userId: string;
  status: AttendanceStatus;
  note: string | null;
  markedById: string;
  updatedAt: Date;
}

export function toPersonSummary(
  user: User | null | undefined,
  withEmail = false,
): PersonSummaryDto | null {
  if (!user) {
    return null;
  }
  const summary: PersonSummaryDto = {
    id: user.id,
    fullName: `${user.firstName} ${user.lastName}`.trim(),
    avatarUrl: user.avatarUrl,
  };
  if (withEmail) {
    summary.email = user.email;
  }
  return summary;
}

export function toSessionDto(session: CohortSession): SessionDto {
  return {
    id: session.id,
    cohortId: session.cohortId,
    title: session.title,
    description: session.description,
    startsAt: session.startsAt,
    endsAt: session.endsAt,
    meetingUrl: session.meetingUrl,
    recordingUrl: session.recordingUrl,
  };
}

export function toCohortDto(cohort: Cohort): CohortDto {
  const dto: CohortDto = {
    id: cohort.id,
    course: cohort.course
      ? { id: cohort.course.id, title: cohort.course.title, slug: cohort.course.slug }
      : null,
    courseId: cohort.courseId,
    title: cohort.title,
    description: cohort.description,
    startsAt: cohort.startsAt,
    endsAt: cohort.endsAt,
    timezone: cohort.timezone,
    capacity: cohort.capacity,
    enrolledCount: cohort.enrolledCount,
    waitlistCount: cohort.waitlistCount,
    seatsLeft: Math.max(0, cohort.capacity - cohort.enrolledCount),
    status: cohort.status,
    instructor: toPersonSummary(cohort.instructor),
    createdAt: cohort.createdAt,
  };
  if (cohort.sessions) {
    dto.sessions = [...cohort.sessions]
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
      .map(toSessionDto);
  }
  return dto;
}

export function toCohortMemberDto(member: CohortMember, withEmail = false): CohortMemberDto {
  const dto: CohortMemberDto = {
    id: member.id,
    cohortId: member.cohortId,
    status: member.status,
    waitlistPosition: member.waitlistPosition,
    joinedAt: member.joinedAt,
    user: toPersonSummary(member.user, withEmail),
  };
  if (member.cohort) {
    dto.cohort = toCohortDto(member.cohort);
  }
  return dto;
}

export function toAttendanceDto(attendance: SessionAttendance): AttendanceDto {
  return {
    id: attendance.id,
    sessionId: attendance.sessionId,
    userId: attendance.userId,
    status: attendance.status,
    note: attendance.note,
    markedById: attendance.markedById,
    updatedAt: attendance.updatedAt,
  };
}

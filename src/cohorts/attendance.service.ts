import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { type User } from '../users/entities/user.entity';
import { CohortsService } from './cohorts.service';
import { type MarkAttendanceDto } from './dto/cohort.dto';
import { SessionAttendance } from './entities/session-attendance.entity';
import { AttendanceStatus, CohortMemberStatus } from './enums/cohort.enums';

export interface MemberAttendanceSummary {
  userId: string;
  fullName: string;
  present: number;
  late: number;
  absent: number;
  excused: number;
  unmarked: number;
  attendanceRate: number;
}

export interface CohortAttendanceSummary {
  cohortId: string;
  sessionsHeld: number;
  members: MemberAttendanceSummary[];
}

const COUNTS_AS_PRESENT: readonly AttendanceStatus[] = [
  AttendanceStatus.PRESENT,
  AttendanceStatus.LATE,
];

@Injectable()
export class AttendanceService {
  constructor(
    @InjectRepository(SessionAttendance) private readonly attendance: Repository<SessionAttendance>,
    private readonly cohortsService: CohortsService,
  ) {}

  /** Upserts attendance for a session. Only enrolled members can be marked. */
  async mark(actor: User, sessionId: string, dto: MarkAttendanceDto): Promise<SessionAttendance[]> {
    const session = await this.cohortsService.loadSession(actor, sessionId);
    const enrolled = await this.cohortsService.enrolledUserIds(session.cohortId);
    const unknown = dto.entries.filter((entry) => !enrolled.has(entry.userId));
    if (unknown.length > 0) {
      throw new BadRequestException(
        `Not enrolled in this cohort: ${unknown.map((entry) => entry.userId).join(', ')}`,
      );
    }
    const userIds = [...new Set(dto.entries.map((entry) => entry.userId))];
    const existing = await this.attendance.find({ where: { sessionId, userId: In(userIds) } });
    const byUser = new Map(existing.map((row) => [row.userId, row]));
    const rows = dto.entries.map((entry) => {
      const row =
        byUser.get(entry.userId) ?? this.attendance.create({ sessionId, userId: entry.userId });
      row.status = entry.status;
      row.note = entry.note ?? null;
      row.markedById = actor.id;
      return row;
    });
    return this.attendance.save(rows);
  }

  async listForSession(actor: User, sessionId: string): Promise<SessionAttendance[]> {
    await this.cohortsService.loadSession(actor, sessionId);
    return this.attendance.find({
      where: { sessionId },
      relations: { user: true },
      order: { createdAt: 'ASC' },
    });
  }

  async summary(actor: User, cohortId: string): Promise<CohortAttendanceSummary> {
    const cohort = await this.cohortsService.findManaged(actor, cohortId);
    const roster = await this.cohortsService.roster(actor, cohortId);
    const heldSessions = (cohort.sessions ?? []).filter(
      (session) => session.endsAt.getTime() <= Date.now(),
    );
    const sessionIds = heldSessions.map((session) => session.id);
    const rows =
      sessionIds.length > 0
        ? await this.attendance.find({ where: { sessionId: In(sessionIds) } })
        : [];

    const members = roster
      .filter((member) => member.status === CohortMemberStatus.ENROLLED)
      .map((member) => {
        const own = rows.filter((row) => row.userId === member.userId);
        const count = (status: AttendanceStatus): number =>
          own.filter((row) => row.status === status).length;
        const present = own.filter((row) => COUNTS_AS_PRESENT.includes(row.status)).length;
        const unmarked = Math.max(0, sessionIds.length - own.length);
        return {
          userId: member.userId,
          fullName: member.user ? `${member.user.firstName} ${member.user.lastName}`.trim() : '',
          present: count(AttendanceStatus.PRESENT),
          late: count(AttendanceStatus.LATE),
          absent: count(AttendanceStatus.ABSENT),
          excused: count(AttendanceStatus.EXCUSED),
          unmarked,
          attendanceRate:
            sessionIds.length === 0 ? 0 : Math.round((present / sessionIds.length) * 100),
        };
      });

    return { cohortId, sessionsHeld: sessionIds.length, members };
  }
}

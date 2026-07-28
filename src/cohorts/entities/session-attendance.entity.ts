import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { AttendanceStatus } from '../enums/cohort.enums';
import { CohortSession } from './cohort-session.entity';

@Entity('session_attendance')
@Index('session_attendance_session_user_unique', ['sessionId', 'userId'], { unique: true })
export class SessionAttendance extends BaseEntity {
  @Column({ name: 'session_id', type: 'uuid' })
  sessionId!: string;

  @ManyToOne(() => CohortSession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session?: CohortSession;

  @Index('session_attendance_user_id_idx')
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ type: 'enum', enum: AttendanceStatus, enumName: 'attendance_status' })
  status!: AttendanceStatus;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note!: string | null;

  @Column({ name: 'marked_by_id', type: 'uuid' })
  markedById!: string;
}

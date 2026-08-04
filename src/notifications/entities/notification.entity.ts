import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';

export enum NotificationType {
  GRADE_POSTED = 'GRADE_POSTED',
  CERTIFICATE_ISSUED = 'CERTIFICATE_ISSUED',
  PAYOUT_THRESHOLD = 'PAYOUT_THRESHOLD',
  COHORT_SEAT_GRANTED = 'COHORT_SEAT_GRANTED',
  SUBMISSION_RECEIVED = 'SUBMISSION_RECEIVED',
  GENERIC = 'GENERIC',
}

@Entity('notifications')
@Index('notifications_user_read_idx', ['userId', 'readAt'])
export class Notification extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ type: 'enum', enum: NotificationType, enumName: 'notification_type' })
  type!: NotificationType;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text' })
  body!: string;

  /** Free form payload such as ids the client can deep link to. */
  @Column({ type: 'jsonb', default: {} })
  data!: Record<string, unknown>;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt!: Date | null;

  get isRead(): boolean {
    return this.readAt !== null;
  }
}

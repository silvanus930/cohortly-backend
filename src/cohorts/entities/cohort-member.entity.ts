import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { CohortMemberStatus } from '../enums/cohort.enums';
import { Cohort } from './cohort.entity';

@Entity('cohort_members')
@Index('cohort_members_cohort_user_unique', ['cohortId', 'userId'], { unique: true })
export class CohortMember extends BaseEntity {
  @Column({ name: 'cohort_id', type: 'uuid' })
  cohortId!: string;

  @ManyToOne(() => Cohort, (cohort) => cohort.members, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cohort_id' })
  cohort?: Cohort;

  @Index('cohort_members_user_id_idx')
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({
    type: 'enum',
    enum: CohortMemberStatus,
    enumName: 'cohort_member_status',
    default: CohortMemberStatus.ENROLLED,
  })
  status!: CohortMemberStatus;

  /** Order in the waitlist; null once enrolled or dropped. */
  @Column({ name: 'waitlist_position', type: 'int', nullable: true })
  waitlistPosition!: number | null;

  @Column({ name: 'joined_at', type: 'timestamptz', nullable: true })
  joinedAt!: Date | null;

  @Column({ name: 'dropped_at', type: 'timestamptz', nullable: true })
  droppedAt!: Date | null;
}

import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Cohort } from './cohort.entity';

/** A scheduled live session, for example a weekly call or workshop. */
@Entity('cohort_sessions')
export class CohortSession extends BaseEntity {
  @Index('cohort_sessions_cohort_id_idx')
  @Column({ name: 'cohort_id', type: 'uuid' })
  cohortId!: string;

  @ManyToOne(() => Cohort, (cohort) => cohort.sessions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cohort_id' })
  cohort?: Cohort;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'starts_at', type: 'timestamptz' })
  startsAt!: Date;

  @Column({ name: 'ends_at', type: 'timestamptz' })
  endsAt!: Date;

  @Column({ name: 'meeting_url', type: 'varchar', length: 2048, nullable: true })
  meetingUrl!: string | null;

  @Column({ name: 'recording_url', type: 'varchar', length: 2048, nullable: true })
  recordingUrl!: string | null;
}

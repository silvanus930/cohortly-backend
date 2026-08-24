import { Column, Entity, Index, JoinColumn, OneToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';

/** Marks the moment an instructor's performance counters were last reset. */
@Entity('instructor_performance_baselines')
export class InstructorPerformanceBaseline extends BaseEntity {
  @Index('instructor_performance_baselines_user_id_unique', { unique: true })
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ name: 'reset_at', type: 'timestamptz' })
  resetAt!: Date;

  @Column({ name: 'reset_by_id', type: 'uuid' })
  resetById!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note!: string | null;
}

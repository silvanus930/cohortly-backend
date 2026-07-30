import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

/** One row per learner per calendar day with any learning activity. Powers streaks. */
@Entity('learning_activity_days')
@Index('learning_activity_days_user_day_unique', ['userId', 'activityDate'], { unique: true })
export class LearningActivityDay extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  /** Calendar date in UTC, stored as YYYY-MM-DD. */
  @Column({ name: 'activity_date', type: 'date' })
  activityDate!: string;

  @Column({ name: 'lessons_completed', type: 'int', default: 0 })
  lessonsCompleted!: number;
}

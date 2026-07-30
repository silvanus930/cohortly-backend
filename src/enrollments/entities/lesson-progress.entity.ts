import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Lesson } from '../../courses/entities/lesson.entity';
import { LessonProgressStatus } from '../enums/enrollment.enums';
import { Enrollment } from './enrollment.entity';

@Entity('lesson_progress')
@Index('lesson_progress_enrollment_lesson_unique', ['enrollmentId', 'lessonId'], { unique: true })
export class LessonProgress extends BaseEntity {
  @Column({ name: 'enrollment_id', type: 'uuid' })
  enrollmentId!: string;

  @ManyToOne(() => Enrollment, (enrollment) => enrollment.lessonProgress, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'enrollment_id' })
  enrollment?: Enrollment;

  @Index('lesson_progress_lesson_id_idx')
  @Column({ name: 'lesson_id', type: 'uuid' })
  lessonId!: string;

  @ManyToOne(() => Lesson, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lesson_id' })
  lesson?: Lesson;

  @Index('lesson_progress_user_id_idx')
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'course_id', type: 'uuid' })
  courseId!: string;

  @Column({
    type: 'enum',
    enum: LessonProgressStatus,
    enumName: 'lesson_progress_status',
    default: LessonProgressStatus.NOT_STARTED,
  })
  status!: LessonProgressStatus;

  /** Playback position for video lessons, in seconds. */
  @Column({ name: 'position_seconds', type: 'int', default: 0 })
  positionSeconds!: number;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;
}

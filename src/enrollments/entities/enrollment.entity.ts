import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Cohort } from '../../cohorts/entities/cohort.entity';
import { Course } from '../../courses/entities/course.entity';
import { User } from '../../users/entities/user.entity';
import { EnrollmentSource, EnrollmentStatus } from '../enums/enrollment.enums';
import { LessonProgress } from './lesson-progress.entity';

@Entity('enrollments')
@Index('enrollments_user_course_unique', ['userId', 'courseId'], { unique: true })
export class Enrollment extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Index('enrollments_course_id_idx')
  @Column({ name: 'course_id', type: 'uuid' })
  courseId!: string;

  @ManyToOne(() => Course, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'course_id' })
  course?: Course;

  @Column({ name: 'cohort_id', type: 'uuid', nullable: true })
  cohortId!: string | null;

  @ManyToOne(() => Cohort, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'cohort_id' })
  cohort?: Cohort | null;

  @Column({ type: 'enum', enum: EnrollmentSource, enumName: 'enrollment_source' })
  source!: EnrollmentSource;

  @Index('enrollments_status_idx')
  @Column({
    type: 'enum',
    enum: EnrollmentStatus,
    enumName: 'enrollment_status',
    default: EnrollmentStatus.ACTIVE,
  })
  status!: EnrollmentStatus;

  @Column({ name: 'purchase_id', type: 'uuid', nullable: true })
  purchaseId!: string | null;

  @Column({ name: 'seat_assignment_id', type: 'uuid', nullable: true })
  seatAssignmentId!: string | null;

  @Column({ name: 'progress_percent', type: 'int', default: 0 })
  progressPercent!: number;

  @Column({ name: 'completed_lessons', type: 'int', default: 0 })
  completedLessons!: number;

  @Column({ name: 'total_lessons', type: 'int', default: 0 })
  totalLessons!: number;

  @Column({ name: 'last_activity_at', type: 'timestamptz', nullable: true })
  lastActivityAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt!: Date | null;

  @OneToMany(() => LessonProgress, (progress) => progress.enrollment)
  lessonProgress?: LessonProgress[];

  get isActive(): boolean {
    return this.status === EnrollmentStatus.ACTIVE;
  }
}

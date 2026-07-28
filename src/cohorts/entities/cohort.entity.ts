import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Course } from '../../courses/entities/course.entity';
import { User } from '../../users/entities/user.entity';
import { CohortStatus } from '../enums/cohort.enums';
import { CohortMember } from './cohort-member.entity';
import { CohortSession } from './cohort-session.entity';

@Entity('cohorts')
export class Cohort extends BaseEntity {
  @Index('cohorts_course_id_idx')
  @Column({ name: 'course_id', type: 'uuid' })
  courseId!: string;

  @ManyToOne(() => Course, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'course_id' })
  course?: Course;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'starts_at', type: 'timestamptz' })
  startsAt!: Date;

  @Column({ name: 'ends_at', type: 'timestamptz' })
  endsAt!: Date;

  @Column({ type: 'varchar', length: 64, default: 'UTC' })
  timezone!: string;

  @Column({ type: 'int' })
  capacity!: number;

  @Index('cohorts_status_idx')
  @Column({
    type: 'enum',
    enum: CohortStatus,
    enumName: 'cohort_status',
    default: CohortStatus.SCHEDULED,
  })
  status!: CohortStatus;

  @Column({ name: 'instructor_id', type: 'uuid' })
  instructorId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'instructor_id' })
  instructor?: User;

  @Column({ name: 'enrolled_count', type: 'int', default: 0 })
  enrolledCount!: number;

  @Column({ name: 'waitlist_count', type: 'int', default: 0 })
  waitlistCount!: number;

  @OneToMany(() => CohortSession, (session) => session.cohort)
  sessions?: CohortSession[];

  @OneToMany(() => CohortMember, (member) => member.cohort)
  members?: CohortMember[];

  get seatsLeft(): number {
    return Math.max(0, this.capacity - this.enrolledCount);
  }
}

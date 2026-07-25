import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Course } from '../../courses/entities/course.entity';
import { User } from '../../users/entities/user.entity';
import { Organization } from './organization.entity';

/** One consumed seat: a learner granted access to a course on the organization's behalf. */
@Entity('seat_assignments')
@Index('seat_assignments_org_user_course_unique', ['organizationId', 'userId', 'courseId'], {
  unique: true,
})
export class SeatAssignment extends BaseEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization;

  @Index('seat_assignments_user_id_idx')
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Index('seat_assignments_course_id_idx')
  @Column({ name: 'course_id', type: 'uuid' })
  courseId!: string;

  @ManyToOne(() => Course, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'course_id' })
  course?: Course;

  @Column({ name: 'assigned_by_id', type: 'uuid' })
  assignedById!: string;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;
}

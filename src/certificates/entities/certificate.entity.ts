import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Course } from '../../courses/entities/course.entity';
import { User } from '../../users/entities/user.entity';

@Entity('certificates')
export class Certificate extends BaseEntity {
  /** Public, human readable verification code such as CHT-7K2M-9QXA. */
  @Index('certificates_code_unique', { unique: true })
  @Column({ type: 'varchar', length: 32 })
  code!: string;

  @Index('certificates_user_id_idx')
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Index('certificates_course_id_idx')
  @Column({ name: 'course_id', type: 'uuid' })
  courseId!: string;

  @ManyToOne(() => Course, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'course_id' })
  course?: Course;

  @Index('certificates_enrollment_id_unique', { unique: true })
  @Column({ name: 'enrollment_id', type: 'uuid' })
  enrollmentId!: string;

  @Column({ name: 'recipient_name', type: 'varchar', length: 200 })
  recipientName!: string;

  @Column({ name: 'course_title', type: 'varchar', length: 200 })
  courseTitle!: string;

  @Column({ name: 'instructor_name', type: 'varchar', length: 200 })
  instructorName!: string;

  @Column({ name: 'completed_at', type: 'timestamptz' })
  completedAt!: Date;

  @Column({ name: 'issued_at', type: 'timestamptz' })
  issuedAt!: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @Column({ name: 'revoke_reason', type: 'varchar', length: 500, nullable: true })
  revokeReason!: string | null;

  /** Rendered SVG, kept so verification works even without object storage. */
  @Column({ type: 'text' })
  svg!: string;

  @Column({ name: 'file_key', type: 'varchar', length: 512, nullable: true })
  fileKey!: string | null;

  @Column({ name: 'file_url', type: 'varchar', length: 2048, nullable: true })
  fileUrl!: string | null;

  @Column({ name: 'template_version', type: 'int', default: 1 })
  templateVersion!: number;

  get isValid(): boolean {
    return this.revokedAt === null;
  }
}

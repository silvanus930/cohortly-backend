import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { SubmissionStatus } from '../enums/assignment.enums';
import { Assignment } from './assignment.entity';

export interface RubricScore {
  criterionId: string;
  points: number;
  comment: string | null;
}

@Entity('submissions')
@Index('submissions_assignment_user_idx', ['assignmentId', 'userId'])
export class Submission extends BaseEntity {
  @Column({ name: 'assignment_id', type: 'uuid' })
  assignmentId!: string;

  @ManyToOne(() => Assignment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assignment_id' })
  assignment?: Assignment;

  @Index('submissions_user_id_idx')
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ name: 'enrollment_id', type: 'uuid' })
  enrollmentId!: string;

  @Column({ name: 'attempt_number', type: 'int' })
  attemptNumber!: number;

  @Column({ type: 'text', nullable: true })
  text!: string | null;

  @Column({ name: 'file_key', type: 'varchar', length: 512, nullable: true })
  fileKey!: string | null;

  @Column({ name: 'file_url', type: 'varchar', length: 2048, nullable: true })
  fileUrl!: string | null;

  @Index('submissions_status_idx')
  @Column({
    type: 'enum',
    enum: SubmissionStatus,
    enumName: 'submission_status',
    default: SubmissionStatus.SUBMITTED,
  })
  status!: SubmissionStatus;

  @Column({ type: 'int', nullable: true })
  score!: number | null;

  @Column({ name: 'rubric_scores', type: 'jsonb', default: [] })
  rubricScores!: RubricScore[];

  @Column({ type: 'text', nullable: true })
  feedback!: string | null;

  @Column({ name: 'graded_by_id', type: 'uuid', nullable: true })
  gradedById!: string | null;

  @Column({ name: 'graded_at', type: 'timestamptz', nullable: true })
  gradedAt!: Date | null;

  @Column({ name: 'submitted_at', type: 'timestamptz' })
  submittedAt!: Date;
}

import { Column, Entity, Index, JoinColumn, OneToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Lesson } from '../../courses/entities/lesson.entity';
import { SubmissionType } from '../enums/assignment.enums';

export interface RubricCriterion {
  id: string;
  criterion: string;
  description: string | null;
  maxPoints: number;
}

@Entity('assignments')
export class Assignment extends BaseEntity {
  @Index('assignments_lesson_id_unique', { unique: true })
  @Column({ name: 'lesson_id', type: 'uuid' })
  lessonId!: string;

  @OneToOne(() => Lesson, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lesson_id' })
  lesson?: Lesson;

  @Index('assignments_course_id_idx')
  @Column({ name: 'course_id', type: 'uuid' })
  courseId!: string;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text' })
  instructions!: string;

  @Column({
    name: 'submission_type',
    type: 'enum',
    enum: SubmissionType,
    enumName: 'submission_type',
    default: SubmissionType.TEXT_OR_FILE,
  })
  submissionType!: SubmissionType;

  @Column({ name: 'max_points', type: 'int', default: 100 })
  maxPoints!: number;

  @Column({ name: 'passing_points', type: 'int', default: 60 })
  passingPoints!: number;

  @Column({ type: 'jsonb', default: [] })
  rubric!: RubricCriterion[];

  @Column({ name: 'allow_resubmission', type: 'boolean', default: true })
  allowResubmission!: boolean;

  /** Zero means unlimited submissions. */
  @Column({ name: 'max_submissions', type: 'int', default: 3 })
  maxSubmissions!: number;
}

import { Column, Entity, Index, JoinColumn, OneToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Lesson } from '../../courses/entities/lesson.entity';

export type QuizQuestionType = 'SINGLE' | 'MULTIPLE' | 'TRUE_FALSE';

export interface QuizOption {
  id: string;
  text: string;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  type: QuizQuestionType;
  options: QuizOption[];
  correctOptionIds: string[];
  points: number;
  explanation: string | null;
}

/** A quiz attached to a lesson of type QUIZ. Questions live in a JSON column. */
@Entity('quizzes')
export class Quiz extends BaseEntity {
  @Index('quizzes_lesson_id_unique', { unique: true })
  @Column({ name: 'lesson_id', type: 'uuid' })
  lessonId!: string;

  @OneToOne(() => Lesson, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lesson_id' })
  lesson?: Lesson;

  @Index('quizzes_course_id_idx')
  @Column({ name: 'course_id', type: 'uuid' })
  courseId!: string;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'jsonb' })
  questions!: QuizQuestion[];

  @Column({ name: 'passing_score', type: 'int', default: 70 })
  passingScore!: number;

  /** Zero means unlimited attempts. */
  @Column({ name: 'max_attempts', type: 'int', default: 3 })
  maxAttempts!: number;

  @Column({ name: 'time_limit_minutes', type: 'int', nullable: true })
  timeLimitMinutes!: number | null;

  @Column({ name: 'shuffle_questions', type: 'boolean', default: false })
  shuffleQuestions!: boolean;

  get totalPoints(): number {
    return this.questions.reduce((sum, question) => sum + question.points, 0);
  }
}

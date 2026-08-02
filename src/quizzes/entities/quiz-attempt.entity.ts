import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { Quiz } from './quiz.entity';

export interface QuizAnswer {
  questionId: string;
  selectedOptionIds: string[];
}

export interface QuizAnswerResult extends QuizAnswer {
  correct: boolean;
  pointsEarned: number;
  pointsPossible: number;
}

@Entity('quiz_attempts')
@Index('quiz_attempts_quiz_user_idx', ['quizId', 'userId'])
export class QuizAttempt extends BaseEntity {
  @Column({ name: 'quiz_id', type: 'uuid' })
  quizId!: string;

  @ManyToOne(() => Quiz, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'quiz_id' })
  quiz?: Quiz;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ name: 'enrollment_id', type: 'uuid' })
  enrollmentId!: string;

  @Column({ name: 'attempt_number', type: 'int' })
  attemptNumber!: number;

  @Column({ type: 'jsonb' })
  answers!: QuizAnswerResult[];

  @Column({ name: 'points_earned', type: 'int' })
  pointsEarned!: number;

  @Column({ name: 'points_total', type: 'int' })
  pointsTotal!: number;

  @Column({ name: 'score_percent', type: 'int' })
  scorePercent!: number;

  @Column({ type: 'boolean' })
  passed!: boolean;

  @Column({ name: 'submitted_at', type: 'timestamptz' })
  submittedAt!: Date;
}

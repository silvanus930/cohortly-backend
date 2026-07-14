import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { CourseLevel, CoursePricing, CourseStatus } from '../enums/course.enums';
import { Category } from './category.entity';
import { CourseFaq } from './course-faq.entity';
import { CourseModule } from './course-module.entity';

@Entity('courses')
export class Course extends BaseEntity {
  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Index('courses_slug_unique', { unique: true })
  @Column({ type: 'varchar', length: 220 })
  slug!: string;

  @Column({ type: 'varchar', length: 500 })
  summary!: string;

  @Column({ type: 'text', default: '' })
  description!: string;

  @Column({
    type: 'enum',
    enum: CourseLevel,
    enumName: 'course_level',
    default: CourseLevel.BEGINNER,
  })
  level!: CourseLevel;

  @Column({
    type: 'enum',
    enum: CoursePricing,
    enumName: 'course_pricing',
    default: CoursePricing.FREE,
  })
  pricing!: CoursePricing;

  @Column({ name: 'price_cents', type: 'int', default: 0 })
  priceCents!: number;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency!: string;

  @Index('courses_status_idx')
  @Column({
    type: 'enum',
    enum: CourseStatus,
    enumName: 'course_status',
    default: CourseStatus.DRAFT,
  })
  status!: CourseStatus;

  @Column({ name: 'cover_url', type: 'varchar', length: 2048, nullable: true })
  coverUrl!: string | null;

  @Column({ type: 'text', array: true, default: '{}' })
  tags!: string[];

  @Column({ name: 'duration_minutes', type: 'int', default: 0 })
  durationMinutes!: number;

  @Column({ name: 'enrollment_count', type: 'int', default: 0 })
  enrollmentCount!: number;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  @Index('courses_category_id_idx')
  @Column({ name: 'category_id', type: 'uuid', nullable: true })
  categoryId!: string | null;

  @ManyToOne(() => Category, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'category_id' })
  category?: Category | null;

  @Index('courses_instructor_id_idx')
  @Column({ name: 'instructor_id', type: 'uuid' })
  instructorId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'instructor_id' })
  instructor?: User;

  @OneToMany(() => CourseModule, (module) => module.course)
  modules?: CourseModule[];

  @OneToMany(() => CourseFaq, (faq) => faq.course)
  faqs?: CourseFaq[];

  get isPublished(): boolean {
    return this.status === CourseStatus.PUBLISHED;
  }
}

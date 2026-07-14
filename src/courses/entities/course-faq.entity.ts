import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Course } from './course.entity';

@Entity('course_faqs')
export class CourseFaq extends BaseEntity {
  @Index('course_faqs_course_id_idx')
  @Column({ name: 'course_id', type: 'uuid' })
  courseId!: string;

  @ManyToOne(() => Course, (course) => course.faqs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'course_id' })
  course?: Course;

  @Column({ type: 'varchar', length: 300 })
  question!: string;

  @Column({ type: 'text' })
  answer!: string;

  @Column({ type: 'int', default: 0 })
  position!: number;
}

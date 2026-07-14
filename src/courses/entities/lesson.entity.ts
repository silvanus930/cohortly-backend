import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { LessonType } from '../enums/course.enums';
import { CourseModule } from './course-module.entity';
import { LessonMaterial } from './lesson-material.entity';

@Entity('lessons')
export class Lesson extends BaseEntity {
  @Index('lessons_module_id_idx')
  @Column({ name: 'module_id', type: 'uuid' })
  moduleId!: string;

  @ManyToOne(() => CourseModule, (module) => module.lessons, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'module_id' })
  module?: CourseModule;

  @Index('lessons_course_id_idx')
  @Column({ name: 'course_id', type: 'uuid' })
  courseId!: string;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'enum', enum: LessonType, enumName: 'lesson_type', default: LessonType.VIDEO })
  type!: LessonType;

  @Column({ type: 'int', default: 0 })
  position!: number;

  @Column({ name: 'duration_minutes', type: 'int', default: 0 })
  durationMinutes!: number;

  @Column({ name: 'content_url', type: 'varchar', length: 2048, nullable: true })
  contentUrl!: string | null;

  @Column({ type: 'text', nullable: true })
  body!: string | null;

  @Column({ name: 'is_preview', type: 'boolean', default: false })
  isPreview!: boolean;

  @OneToMany(() => LessonMaterial, (material) => material.lesson)
  materials?: LessonMaterial[];
}

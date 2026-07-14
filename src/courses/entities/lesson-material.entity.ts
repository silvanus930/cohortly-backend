import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Lesson } from './lesson.entity';

@Entity('lesson_materials')
export class LessonMaterial extends BaseEntity {
  @Index('lesson_materials_lesson_id_idx')
  @Column({ name: 'lesson_id', type: 'uuid' })
  lessonId!: string;

  @ManyToOne(() => Lesson, (lesson) => lesson.materials, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lesson_id' })
  lesson?: Lesson;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ name: 'file_key', type: 'varchar', length: 512 })
  fileKey!: string;

  @Column({ name: 'file_url', type: 'varchar', length: 2048 })
  fileUrl!: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 150 })
  mimeType!: string;

  @Column({ name: 'size_bytes', type: 'bigint', default: 0 })
  sizeBytes!: string;

  @Column({ type: 'int', default: 0 })
  position!: number;
}

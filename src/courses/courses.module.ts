import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';
import { Category } from './entities/category.entity';
import { CourseFaq } from './entities/course-faq.entity';
import { CourseModule } from './entities/course-module.entity';
import { Course } from './entities/course.entity';
import { LessonMaterial } from './entities/lesson-material.entity';
import { Lesson } from './entities/lesson.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Category, Course, CourseModule, Lesson, LessonMaterial, CourseFaq]),
    UsersModule,
  ],
  controllers: [CategoriesController, CoursesController],
  providers: [CategoriesService, CoursesService],
  exports: [CoursesService, CategoriesService, TypeOrmModule],
})
export class CoursesModule {}

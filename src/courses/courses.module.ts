import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { CourseAssetsController } from './course-assets.controller';
import { CourseAssetsService } from './course-assets.service';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';
import { CurriculumController } from './curriculum.controller';
import { CurriculumService } from './curriculum.service';
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
  controllers: [
    CategoriesController,
    CoursesController,
    CurriculumController,
    CourseAssetsController,
  ],
  providers: [CategoriesService, CoursesService, CurriculumService, CourseAssetsService],
  exports: [CoursesService, CategoriesService, TypeOrmModule],
})
export class CoursesModule {}

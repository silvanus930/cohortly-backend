import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CohortsModule } from '../cohorts/cohorts.module';
import { CoursesModule } from '../courses/courses.module';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { QuizzesModule } from '../quizzes/quizzes.module';
import { UsersModule } from '../users/users.module';
import { AssignmentsController, AssignmentsManageController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';
import { Assignment } from './entities/assignment.entity';
import { Submission } from './entities/submission.entity';
import { GradebookService } from './gradebook.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Assignment, Submission]),
    CoursesModule,
    EnrollmentsModule,
    CohortsModule,
    QuizzesModule,
    UsersModule,
  ],
  controllers: [AssignmentsManageController, AssignmentsController],
  providers: [AssignmentsService, GradebookService],
  exports: [AssignmentsService, GradebookService, TypeOrmModule],
})
export class AssignmentsModule {}

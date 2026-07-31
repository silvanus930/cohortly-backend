import { ForbiddenException, Module, type OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CohortsModule } from '../cohorts/cohorts.module';
import { CohortsService } from '../cohorts/cohorts.service';
import { CatalogService } from '../courses/catalog.service';
import { CoursesModule } from '../courses/courses.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { UsersModule } from '../users/users.module';
import { EnrollmentsController, EnrollmentsManageController } from './enrollments.controller';
import { EnrollmentsService } from './enrollments.service';
import { Enrollment } from './entities/enrollment.entity';
import { LearningActivityDay } from './entities/learning-activity.entity';
import { LessonProgress } from './entities/lesson-progress.entity';
import { ProgressService } from './progress.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Enrollment, LessonProgress, LearningActivityDay]),
    CoursesModule,
    CohortsModule,
    OrganizationsModule,
    UsersModule,
  ],
  controllers: [EnrollmentsController, EnrollmentsManageController],
  providers: [EnrollmentsService, ProgressService],
  exports: [EnrollmentsService, ProgressService, TypeOrmModule],
})
export class EnrollmentsModule implements OnModuleInit {
  constructor(
    private readonly enrollmentsService: EnrollmentsService,
    private readonly catalogService: CatalogService,
    private readonly cohortsService: CohortsService,
  ) {}

  /** Wires enrollment based rules into the catalog and cohorts without cyclic imports. */
  onModuleInit(): void {
    this.catalogService.registerContentAccessResolver(async (course, viewer) =>
      viewer ? this.enrollmentsService.hasAccess(viewer.id, course.id) : false,
    );
    this.cohortsService.registerJoinPolicy(async (user, cohort) => {
      if (!(await this.enrollmentsService.hasAccess(user.id, cohort.courseId))) {
        throw new ForbiddenException('Enroll in the course before joining one of its cohorts');
      }
    });
  }
}

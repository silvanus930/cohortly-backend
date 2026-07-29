import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoursesModule } from '../courses/courses.module';
import { UsersModule } from '../users/users.module';
import { AttendanceService } from './attendance.service';
import { CohortsManageController } from './cohorts-manage.controller';
import { CohortsController } from './cohorts.controller';
import { CohortsService } from './cohorts.service';
import { CohortMember } from './entities/cohort-member.entity';
import { CohortSession } from './entities/cohort-session.entity';
import { Cohort } from './entities/cohort.entity';
import { SessionAttendance } from './entities/session-attendance.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Cohort, CohortSession, CohortMember, SessionAttendance]),
    CoursesModule,
    UsersModule,
  ],
  controllers: [CohortsController, CohortsManageController],
  providers: [CohortsService, AttendanceService],
  exports: [CohortsService, AttendanceService, TypeOrmModule],
})
export class CohortsModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { AnalyticsController, InstructorPerformanceController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { InstructorPerformanceBaseline } from './entities/instructor-performance-baseline.entity';
import { InstructorPerformanceService } from './instructor-performance.service';

@Module({
  imports: [TypeOrmModule.forFeature([InstructorPerformanceBaseline]), UsersModule],
  controllers: [AnalyticsController, InstructorPerformanceController],
  providers: [AnalyticsService, InstructorPerformanceService],
  exports: [AnalyticsService, InstructorPerformanceService],
})
export class AnalyticsModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoursesModule } from '../courses/courses.module';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { Purchase } from './entities/purchase.entity';
import { StripeEvent } from './entities/stripe-event.entity';
import { PaymentsController, PurchasesManageController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { StripeClientService } from './stripe-client.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Purchase, StripeEvent]),
    CoursesModule,
    EnrollmentsModule,
    OrganizationsModule,
  ],
  controllers: [PaymentsController, PurchasesManageController],
  providers: [PaymentsService, StripeClientService],
  exports: [PaymentsService, StripeClientService, TypeOrmModule],
})
export class PaymentsModule {}

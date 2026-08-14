import { Module, type OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoursesModule } from '../courses/courses.module';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { UsersModule } from '../users/users.module';
import { CertificatesController, CertificatesManageController } from './certificates.controller';
import { CertificatesService } from './certificates.service';
import { Certificate } from './entities/certificate.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Certificate]), CoursesModule, EnrollmentsModule, UsersModule],
  controllers: [CertificatesController, CertificatesManageController],
  providers: [CertificatesService, CertificatesController],
  exports: [CertificatesService, TypeOrmModule],
})
export class CertificatesModule implements OnModuleInit {
  constructor(
    private readonly certificatesService: CertificatesService,
    private readonly enrollmentsService: EnrollmentsService,
  ) {}

  /** Every completed enrollment automatically earns a certificate. */
  onModuleInit(): void {
    this.enrollmentsService.registerCompletionHandler(async (enrollment, user) => {
      await this.certificatesService.issueForEnrollment(enrollment, user);
    });
  }
}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoursesModule } from '../courses/courses.module';
import { UsersModule } from '../users/users.module';
import { OrganizationInvitation } from './entities/organization-invitation.entity';
import { OrganizationMembership } from './entities/organization-membership.entity';
import { Organization } from './entities/organization.entity';
import { SeatAssignment } from './entities/seat-assignment.entity';
import { SeatPack } from './entities/seat-pack.entity';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Organization,
      OrganizationMembership,
      SeatPack,
      SeatAssignment,
      OrganizationInvitation,
    ]),
    UsersModule,
    CoursesModule,
  ],
  controllers: [OrganizationsController],
  providers: [OrganizationsService],
  exports: [OrganizationsService, TypeOrmModule],
})
export class OrganizationsModule {}

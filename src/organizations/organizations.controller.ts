import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { type Paginated } from '../common/pagination/pagination';
import { type User } from '../users/entities/user.entity';
import {
  AcceptInvitationDto,
  AssignSeatDto,
  CreateOrganizationDto,
  GrantSeatPackDto,
  InviteMemberDto,
  ListMembersQueryDto,
  ListOrganizationsQueryDto,
  UpdateOrganizationDto,
} from './dto/organization.dto';
import { type OrganizationMemberRole } from './enums/organization.enums';
import {
  type InvitationDto,
  type MembershipDto,
  type OrganizationDto,
  type SeatAssignmentDto,
  type SeatPackDto,
  toInvitationDto,
  toMembershipDto,
  toOrganizationDto,
  toSeatAssignmentDto,
  toSeatPackDto,
} from './organizations.mapper';
import {
  type OrganizationDashboard,
  OrganizationsService,
  type SeatSummary,
} from './organizations.service';

export interface OrganizationViewDto {
  organization: OrganizationDto;
  membershipRole: OrganizationMemberRole | null;
  canManage: boolean;
}

export interface OrganizationDashboardDto extends Omit<OrganizationDashboard, 'organization'> {
  organization: OrganizationDto;
  seats: SeatSummary;
}

@ApiTags('organizations')
@ApiBearerAuth()
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Roles(UserRole.ADMIN)
  @Post()
  @ApiOperation({ summary: 'Create an organization and make its owner an org admin' })
  async create(
    @CurrentUser() actor: User,
    @Body() dto: CreateOrganizationDto,
  ): Promise<OrganizationDto> {
    return toOrganizationDto(await this.organizationsService.create(actor, dto));
  }

  @Roles(UserRole.ADMIN)
  @Get()
  async list(@Query() query: ListOrganizationsQueryDto): Promise<Paginated<OrganizationDto>> {
    const page = await this.organizationsService.list(query);
    return { items: page.items.map(toOrganizationDto), meta: page.meta };
  }

  @Get('mine')
  @ApiOperation({ summary: 'Organizations the current user belongs to' })
  async mine(
    @CurrentUser() actor: User,
  ): Promise<{ organization: OrganizationDto; role: OrganizationMemberRole }[]> {
    const rows = await this.organizationsService.listMine(actor);
    return rows.map((row) => ({
      organization: toOrganizationDto(row.organization),
      role: row.role,
    }));
  }

  @Post('invitations/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept an invitation with the token from the email' })
  async acceptInvitation(
    @CurrentUser() actor: User,
    @Body() dto: AcceptInvitationDto,
  ): Promise<MembershipDto> {
    return toMembershipDto(await this.organizationsService.acceptInvitation(actor, dto.token));
  }

  @Get(':id')
  async findOne(
    @CurrentUser() actor: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrganizationViewDto> {
    const context = await this.organizationsService.requireView(actor, id);
    return {
      organization: toOrganizationDto(context.organization),
      membershipRole: context.membershipRole,
      canManage: context.canManage,
    };
  }

  @Patch(':id')
  async update(
    @CurrentUser() actor: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrganizationDto,
  ): Promise<OrganizationDto> {
    return toOrganizationDto(await this.organizationsService.update(actor, id, dto));
  }

  @Get(':id/dashboard')
  @ApiOperation({ summary: 'Seat usage, membership counts and per course consumption' })
  async dashboard(
    @CurrentUser() actor: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrganizationDashboardDto> {
    const dashboard = await this.organizationsService.dashboard(actor, id);
    return { ...dashboard, organization: toOrganizationDto(dashboard.organization) };
  }

  @Roles(UserRole.ADMIN)
  @Post(':id/seat-packs')
  @ApiOperation({ summary: 'Grant seats manually, for example after an offline contract' })
  async grantSeatPack(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GrantSeatPackDto,
  ): Promise<SeatPackDto> {
    return toSeatPackDto(await this.organizationsService.grantSeatPack(id, dto));
  }

  @Get(':id/seat-packs')
  async listSeatPacks(
    @CurrentUser() actor: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SeatPackDto[]> {
    return (await this.organizationsService.listSeatPacks(actor, id)).map(toSeatPackDto);
  }

  @Get(':id/members')
  async members(
    @CurrentUser() actor: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListMembersQueryDto,
  ): Promise<Paginated<MembershipDto>> {
    const page = await this.organizationsService.members(actor, id, query);
    return { items: page.items.map(toMembershipDto), meta: page.meta };
  }

  @Delete(':id/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(
    @CurrentUser() actor: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<void> {
    return this.organizationsService.removeMember(actor, id, userId);
  }

  @Post(':id/invitations')
  @ApiOperation({ summary: 'Email an invitation to join the organization' })
  async invite(
    @CurrentUser() actor: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InviteMemberDto,
  ): Promise<InvitationDto> {
    const { invitation } = await this.organizationsService.invite(actor, id, dto);
    return toInvitationDto(invitation);
  }

  @Get(':id/invitations')
  async listInvitations(
    @CurrentUser() actor: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<InvitationDto[]> {
    return (await this.organizationsService.listInvitations(actor, id)).map(toInvitationDto);
  }

  @Delete(':id/invitations/:invitationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeInvitation(
    @CurrentUser() actor: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
  ): Promise<void> {
    return this.organizationsService.revokeInvitation(actor, id, invitationId);
  }

  @Post(':id/seats')
  @ApiOperation({ summary: 'Assign one of the organization seats to a member for a course' })
  async assignSeat(
    @CurrentUser() actor: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignSeatDto,
  ): Promise<SeatAssignmentDto> {
    return toSeatAssignmentDto(await this.organizationsService.assignSeat(actor, id, dto));
  }

  @Get(':id/seats')
  async listSeats(
    @CurrentUser() actor: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SeatAssignmentDto[]> {
    return (await this.organizationsService.listSeatAssignments(actor, id)).map(
      toSeatAssignmentDto,
    );
  }

  @Delete(':id/seats/:assignmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeSeat(
    @CurrentUser() actor: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
  ): Promise<void> {
    return this.organizationsService.revokeSeat(actor, id, assignmentId);
  }
}

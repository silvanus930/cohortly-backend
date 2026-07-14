import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { type Paginated } from '../common/pagination/pagination';
import { ChangeRoleDto, ChangeStatusDto } from './dto/change-role.dto';
import { ListUsersQueryDto } from './dto/list-users.query.dto';
import { type User } from './entities/user.entity';
import { toUserDto, UserDto } from './users.mapper';
import { type UserAnalyticsSummary, UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List users with filters and pagination' })
  async list(@Query() query: ListUsersQueryDto): Promise<Paginated<UserDto>> {
    const page = await this.usersService.list(query);
    return { items: page.items.map(toUserDto), meta: page.meta };
  }

  @Get('analytics/summary')
  @ApiOperation({ summary: 'Headline user metrics for the admin dashboard' })
  analytics(): Promise<UserAnalyticsSummary> {
    return this.usersService.analyticsSummary();
  }

  @Get(':id')
  @ApiOkResponse({ type: UserDto })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<UserDto> {
    return toUserDto(await this.usersService.findByIdOrFail(id));
  }

  @Patch(':id/role')
  @ApiOperation({ summary: 'Change a user role. Only superadmins may grant or revoke superadmin.' })
  async changeRole(
    @CurrentUser() actor: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeRoleDto,
  ): Promise<UserDto> {
    const target = await this.usersService.findByIdOrFail(id);
    const touchesSuperadmin =
      dto.role === UserRole.SUPERADMIN || target.role === UserRole.SUPERADMIN;
    if (touchesSuperadmin && actor.role !== UserRole.SUPERADMIN) {
      throw new ForbiddenException('Only a superadmin can change superadmin membership');
    }
    if (actor.id === target.id) {
      throw new ForbiddenException('You cannot change your own role');
    }
    return toUserDto(await this.usersService.changeRole(id, dto.role));
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Activate or suspend a user' })
  async changeStatus(
    @CurrentUser() actor: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeStatusDto,
  ): Promise<UserDto> {
    const target = await this.usersService.findByIdOrFail(id);
    if (actor.id === target.id) {
      throw new ForbiddenException('You cannot change your own status');
    }
    if (target.role === UserRole.SUPERADMIN && actor.role !== UserRole.SUPERADMIN) {
      throw new ForbiddenException('Only a superadmin can suspend a superadmin');
    }
    return toUserDto(await this.usersService.setStatus(id, dto.status));
  }
}

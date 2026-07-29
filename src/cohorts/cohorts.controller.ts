import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { type Paginated } from '../common/pagination/pagination';
import { type User } from '../users/entities/user.entity';
import {
  type CohortDto,
  type CohortMemberDto,
  toCohortDto,
  toCohortMemberDto,
} from './cohorts.mapper';
import { CohortsService } from './cohorts.service';
import { ListCohortsQueryDto } from './dto/cohort.dto';

@ApiTags('cohorts')
@Controller('cohorts')
export class CohortsController {
  constructor(private readonly cohortsService: CohortsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Upcoming cohorts of published courses' })
  async list(@Query() query: ListCohortsQueryDto): Promise<Paginated<CohortDto>> {
    const page = await this.cohortsService.listPublic(query);
    return { items: page.items.map(toCohortDto), meta: page.meta };
  }

  @ApiBearerAuth()
  @Get('mine')
  @ApiOperation({ summary: 'Cohorts the current learner is enrolled in or waitlisted for' })
  async mine(@CurrentUser() user: User): Promise<CohortMemberDto[]> {
    return (await this.cohortsService.mine(user)).map((member) => toCohortMemberDto(member));
  }

  @Public()
  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<CohortDto> {
    return toCohortDto(await this.cohortsService.findPublic(id));
  }

  @ApiBearerAuth()
  @Post(':id/join')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Join a cohort, or its waitlist when full' })
  async join(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CohortMemberDto> {
    return toCohortMemberDto(await this.cohortsService.join(user, id));
  }

  @ApiBearerAuth()
  @Post(':id/leave')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Leave a cohort. The first waitlisted learner takes the seat.' })
  async leave(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ promoted: CohortMemberDto | null }> {
    const promoted = await this.cohortsService.leave(user, id);
    return { promoted: promoted ? toCohortMemberDto(promoted) : null };
  }
}

import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { OptionalAuthGuard } from '../auth/guards/optional-auth.guard';
import { type Paginated } from '../common/pagination/pagination';
import { type User } from '../users/entities/user.entity';
import { CatalogService } from './catalog.service';
import {
  type CourseDetailDto,
  type CourseSummaryDto,
  toCourseDetail,
  toCourseSummary,
} from './courses.mapper';
import { ListCatalogQueryDto, RecommendationsQueryDto } from './dto/catalog.dto';

/** Public browsing surface. Signed in visitors get personalised recommendations. */
@ApiTags('catalog')
@Public()
@UseGuards(OptionalAuthGuard)
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('courses')
  @ApiOperation({ summary: 'Search published courses' })
  async list(@Query() query: ListCatalogQueryDto): Promise<Paginated<CourseSummaryDto>> {
    const page = await this.catalogService.list(query);
    return { items: page.items.map(toCourseSummary), meta: page.meta };
  }

  @Get('recommendations')
  @ApiOperation({ summary: 'Popular courses, excluding ones the viewer already teaches' })
  async recommendations(
    @CurrentUser() viewer: User | undefined,
    @Query() query: RecommendationsQueryDto,
  ): Promise<CourseSummaryDto[]> {
    const courses = await this.catalogService.recommend(viewer, query);
    return courses.map(toCourseSummary);
  }

  @Get('courses/:slug')
  @ApiOperation({
    summary: 'Course detail. Lesson content is hidden unless the viewer may access it.',
  })
  async findBySlug(
    @CurrentUser() viewer: User | undefined,
    @Param('slug') slug: string,
  ): Promise<CourseDetailDto> {
    const { course, includeContent } = await this.catalogService.findBySlug(slug, viewer);
    return toCourseDetail(course, includeContent);
  }
}

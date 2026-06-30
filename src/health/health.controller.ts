import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { type Response } from 'express';
import { type HealthReport, HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOkResponse({ description: 'All components are reachable' })
  @ApiServiceUnavailableResponse({ description: 'A dependency is unreachable' })
  async check(@Res({ passthrough: true }) response: Response): Promise<HealthReport> {
    const report = await this.healthService.report();
    response.status(report.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return report;
  }
}

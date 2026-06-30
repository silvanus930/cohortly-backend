import { HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { type Response } from 'express';
import { HealthController } from './health.controller';
import { type HealthReport, HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;
  const healthService = { report: jest.fn<Promise<HealthReport>, []>() };
  const response = { status: jest.fn() } as unknown as Response;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: healthService }],
    }).compile();

    controller = moduleRef.get(HealthController);
  });

  it('returns 200 with the report when every component is up', async () => {
    const report: HealthReport = {
      status: 'ok',
      uptimeSeconds: 12,
      timestamp: new Date().toISOString(),
      checks: { database: 'up' },
    };
    healthService.report.mockResolvedValue(report);

    await expect(controller.check(response)).resolves.toEqual(report);
    expect(response.status).toHaveBeenCalledWith(HttpStatus.OK);
  });

  it('returns 503 when the database is down', async () => {
    healthService.report.mockResolvedValue({
      status: 'degraded',
      uptimeSeconds: 1,
      timestamp: new Date().toISOString(),
      checks: { database: 'down' },
    });

    const result = await controller.check(response);

    expect(result.status).toBe('degraded');
    expect(response.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
  });
});

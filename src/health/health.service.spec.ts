import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { HealthService } from './health.service';

describe('HealthService', () => {
  let service: HealthService;
  const dataSource = { query: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const moduleRef = await Test.createTestingModule({
      providers: [HealthService, { provide: DataSource, useValue: dataSource }],
    }).compile();

    service = moduleRef.get(HealthService);
  });

  it('reports ok when the database answers', async () => {
    dataSource.query.mockResolvedValue([{ '?column?': 1 }]);

    const report = await service.report();

    expect(report.status).toBe('ok');
    expect(report.checks.database).toBe('up');
    expect(report.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(dataSource.query).toHaveBeenCalledWith('SELECT 1');
  });

  it('reports degraded when the database throws', async () => {
    dataSource.query.mockRejectedValue(new Error('connection refused'));

    const report = await service.report();

    expect(report.status).toBe('degraded');
    expect(report.checks.database).toBe('down');
  });
});

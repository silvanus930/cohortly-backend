import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export type ComponentStatus = 'up' | 'down';

export interface HealthReport {
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  timestamp: string;
  checks: {
    database: ComponentStatus;
  };
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async report(): Promise<HealthReport> {
    const database = await this.checkDatabase();
    return {
      status: database === 'up' ? 'ok' : 'degraded',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      checks: { database },
    };
  }

  private async checkDatabase(): Promise<ComponentStatus> {
    try {
      await this.dataSource.query('SELECT 1');
      return 'up';
    } catch (error) {
      this.logger.error(
        'Database health check failed',
        error instanceof Error ? error.stack : error,
      );
      return 'down';
    }
  }
}

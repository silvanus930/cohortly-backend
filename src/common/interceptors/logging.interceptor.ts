import {
  type CallHandler,
  type ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import { type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { type Observable, tap } from 'rxjs';

export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Attaches a request id to every response and writes one structured log line
 * per request with the method, path, status and duration.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const startedAt = Date.now();
    const requestId = this.resolveRequestId(request);
    response.setHeader(REQUEST_ID_HEADER, requestId);

    return next.handle().pipe(
      tap({
        next: () => this.write(request, response.statusCode, startedAt, requestId),
        error: (error: unknown) =>
          this.write(request, this.statusFromError(error), startedAt, requestId),
      }),
    );
  }

  private resolveRequestId(request: Request): string {
    const header = request.headers[REQUEST_ID_HEADER];
    const value = Array.isArray(header) ? header[0] : header;
    return value && value.length <= 128 ? value : randomUUID();
  }

  private statusFromError(error: unknown): number {
    return error instanceof HttpException ? error.getStatus() : 500;
  }

  private write(request: Request, status: number, startedAt: number, requestId: string): void {
    const duration = Date.now() - startedAt;
    const line = `${request.method} ${request.originalUrl ?? request.url} ${status} ${duration}ms rid=${requestId}`;
    if (status >= 500) {
      this.logger.error(line);
    } else if (status >= 400) {
      this.logger.warn(line);
    } else {
      this.logger.log(line);
    }
  }
}

import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { type Request, type Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { httpStatusText } from './http-status-text';

export interface ErrorResponseBody {
  statusCode: number;
  error: string;
  message: string | string[];
  details?: unknown;
  path: string;
  timestamp: string;
}

interface DescribedError {
  status: number;
  error: string;
  message: string | string[];
  details?: unknown;
}

const PG_UNIQUE_VIOLATION = '23505';
const PG_FOREIGN_KEY_VIOLATION = '23503';
const SERVER_ERROR_THRESHOLD = 500;

function describeStatus(status: number, message: string | string[]): DescribedError {
  return { status, error: httpStatusText(status), message };
}

function driverErrorCode(exception: { driverError: unknown }): string | undefined {
  const driverError: unknown = exception.driverError;
  if (typeof driverError !== 'object' || driverError === null || !('code' in driverError)) {
    return undefined;
  }
  const code: unknown = (driverError as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

/**
 * Normalises every thrown value into a single error shape so clients can rely
 * on one contract regardless of where the failure originated.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const described = this.describe(exception);
    const path = request.originalUrl ?? request.url;

    if (described.status >= SERVER_ERROR_THRESHOLD) {
      this.logger.error(
        `${request.method} ${path} failed with ${described.status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ErrorResponseBody = {
      statusCode: described.status,
      error: described.error,
      message: described.message,
      path,
      timestamp: new Date().toISOString(),
    };
    if (described.details !== undefined) {
      body.details = described.details;
    }
    response.status(described.status).json(body);
  }

  describe(exception: unknown): DescribedError {
    if (exception instanceof HttpException) {
      return this.describeHttpException(exception);
    }
    if (exception instanceof QueryFailedError) {
      return this.describeQueryFailure(driverErrorCode(exception));
    }
    return describeStatus(HttpStatus.INTERNAL_SERVER_ERROR, 'An unexpected error occurred');
  }

  private describeHttpException(exception: HttpException): DescribedError {
    const status = exception.getStatus();
    const payload = exception.getResponse();
    if (typeof payload === 'string') {
      return describeStatus(status, payload);
    }
    const body = payload as { message?: string | string[]; error?: string; details?: unknown };
    return {
      status,
      error: body.error ?? httpStatusText(status),
      message: body.message ?? exception.message,
      details: body.details,
    };
  }

  private describeQueryFailure(code: string | undefined): DescribedError {
    switch (code) {
      case PG_UNIQUE_VIOLATION:
        return describeStatus(
          HttpStatus.CONFLICT,
          'A record with the same unique value already exists',
        );
      case PG_FOREIGN_KEY_VIOLATION:
        return describeStatus(HttpStatus.BAD_REQUEST, 'A referenced record does not exist');
      default:
        return describeStatus(HttpStatus.INTERNAL_SERVER_ERROR, 'A database error occurred');
    }
  }
}

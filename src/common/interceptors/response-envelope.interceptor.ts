import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Observable, map } from 'rxjs';
import { SKIP_ENVELOPE_KEY } from '../decorators/skip-envelope.decorator';
import { isPaginated, type PaginationMeta } from '../pagination/pagination';

export interface ResponseEnvelope<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export function wrapInEnvelope(payload: unknown): ResponseEnvelope<unknown> {
  if (isPaginated(payload)) {
    return { success: true, data: payload.items, meta: payload.meta };
  }
  return { success: true, data: payload ?? null };
}

/**
 * Wraps successful responses in a predictable `{ success, data, meta }`
 * envelope. Paginated results have their metadata hoisted next to the data.
 */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }
    const skip = this.reflector.getAllAndOverride<boolean | undefined>(SKIP_ENVELOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) {
      return next.handle();
    }
    return next.handle().pipe(map((payload: unknown) => wrapInEnvelope(payload)));
  }
}

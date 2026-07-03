import { type CallHandler, type ExecutionContext, Logger, NotFoundException } from '@nestjs/common';
import { type Reflector } from '@nestjs/core';
import { lastValueFrom, of, throwError } from 'rxjs';
import { LoggingInterceptor, REQUEST_ID_HEADER } from './logging.interceptor';
import { ResponseEnvelopeInterceptor, wrapInEnvelope } from './response-envelope.interceptor';

function createContext(overrides: {
  type?: string;
  headers?: Record<string, string>;
  statusCode?: number;
}): { context: ExecutionContext; response: { setHeader: jest.Mock; statusCode: number } } {
  const response = { setHeader: jest.fn(), statusCode: overrides.statusCode ?? 200 };
  const request = { method: 'GET', originalUrl: '/api/v1/ping', headers: overrides.headers ?? {} };
  const context = {
    getType: () => overrides.type ?? 'http',
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ExecutionContext;
  return { context, response };
}

const handler = (payload: unknown): CallHandler => ({ handle: () => of(payload) });

describe('ResponseEnvelopeInterceptor', () => {
  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
  const interceptor = new ResponseEnvelopeInterceptor(reflector);

  beforeEach(() => jest.clearAllMocks());

  it('wraps plain payloads', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);
    const { context } = createContext({});

    const result = await lastValueFrom(interceptor.intercept(context, handler({ id: 1 })));

    expect(result).toEqual({ success: true, data: { id: 1 } });
  });

  it('hoists pagination meta next to the data', () => {
    const paginated = { items: [1, 2], meta: { page: 1, limit: 2, total: 2 } };

    expect(wrapInEnvelope(paginated)).toEqual({
      success: true,
      data: [1, 2],
      meta: paginated.meta,
    });
  });

  it('turns undefined into null so the data key is always present', () => {
    expect(wrapInEnvelope(undefined)).toEqual({ success: true, data: null });
  });

  it('leaves handlers marked with the skip decorator untouched', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);
    const { context } = createContext({});

    const result = await lastValueFrom(interceptor.intercept(context, handler('raw')));

    expect(result).toBe('raw');
  });

  it('ignores non http contexts', async () => {
    const { context } = createContext({ type: 'rpc' });

    const result = await lastValueFrom(interceptor.intercept(context, handler('raw')));

    expect(result).toBe('raw');
  });
});

describe('LoggingInterceptor', () => {
  const interceptor = new LoggingInterceptor();

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('assigns a request id and logs successful requests', async () => {
    const { context, response } = createContext({});

    await lastValueFrom(interceptor.intercept(context, handler('ok')));

    expect(response.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, expect.any(String));
    expect(Logger.prototype.log).toHaveBeenCalledWith(
      expect.stringContaining('GET /api/v1/ping 200'),
    );
  });

  it('reuses an incoming request id', async () => {
    const { context, response } = createContext({ headers: { [REQUEST_ID_HEADER]: 'abc-123' } });

    await lastValueFrom(interceptor.intercept(context, handler('ok')));

    expect(response.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, 'abc-123');
  });

  it('logs the status of thrown http exceptions as warnings', async () => {
    const { context } = createContext({});
    const failing: CallHandler = { handle: () => throwError(() => new NotFoundException()) };

    await expect(lastValueFrom(interceptor.intercept(context, failing))).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(Logger.prototype.warn).toHaveBeenCalledWith(expect.stringContaining(' 404 '));
  });

  it('logs unknown failures as errors', async () => {
    const { context } = createContext({});
    const failing: CallHandler = { handle: () => throwError(() => new Error('boom')) };

    await expect(lastValueFrom(interceptor.intercept(context, failing))).rejects.toThrow('boom');
    expect(Logger.prototype.error).toHaveBeenCalledWith(expect.stringContaining(' 500 '));
  });
});

import {
  type ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { httpStatusText } from './http-status-text';

function createHost(): {
  host: ArgumentsHost;
  response: { status: jest.Mock; json: jest.Mock };
} {
  const response = { status: jest.fn(), json: jest.fn() };
  response.status.mockReturnValue(response);
  const request = { method: 'GET', originalUrl: '/api/v1/things/1' };
  const host = {
    switchToHttp: () => ({ getResponse: () => response, getRequest: () => request }),
  } as unknown as ArgumentsHost;
  return { host, response };
}

describe('httpStatusText', () => {
  it('turns enum names into reason phrases', () => {
    expect(httpStatusText(404)).toBe('Not Found');
    expect(httpStatusText(500)).toBe('Internal Server Error');
    expect(httpStatusText(422)).toBe('Unprocessable Entity');
  });

  it('falls back for unknown codes', () => {
    expect(httpStatusText(799)).toBe('Error');
  });
});

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('serialises http exceptions with status, error and path', () => {
    const { host, response } = createHost();

    filter.catch(new NotFoundException('Course missing'), host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        error: 'Not Found',
        message: 'Course missing',
        path: '/api/v1/things/1',
      }),
    );
  });

  it('keeps validation message arrays intact', () => {
    const { host, response } = createHost();

    filter.catch(new BadRequestException(['email must be an email', 'name is required']), host);

    const body = response.json.mock.calls[0][0] as { message: string[] };
    expect(body.message).toEqual(['email must be an email', 'name is required']);
  });

  it('uses the plain string response of an exception as its message', () => {
    const { host, response } = createHost();

    filter.catch(new ForbiddenException(), host);

    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, error: 'Forbidden', message: 'Forbidden' }),
    );
  });

  it('maps unique constraint violations to a conflict', () => {
    const { host, response } = createHost();
    const driverError = Object.assign(new Error('duplicate key'), { code: '23505' });

    filter.catch(new QueryFailedError('INSERT', [], driverError), host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
  });

  it('maps foreign key violations to a bad request', () => {
    const { host, response } = createHost();
    const driverError = Object.assign(new Error('fk'), { code: '23503' });

    filter.catch(new QueryFailedError('INSERT', [], driverError), host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
  });

  it('hides unexpected errors behind a generic 500 and logs them', () => {
    const { host, response } = createHost();

    filter.catch(new Error('boom'), host);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'An unexpected error occurred' }),
    );
    expect(Logger.prototype.error).toHaveBeenCalled();
  });
});

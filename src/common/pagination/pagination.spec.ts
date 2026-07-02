import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { type ObjectLiteral, type Repository, type SelectQueryBuilder } from 'typeorm';
import { PaginationQueryDto } from './pagination-query.dto';
import {
  buildPaginationMeta,
  isPaginated,
  normalizePageRequest,
  paginateArray,
  paginateQuery,
  paginateRepository,
} from './pagination';

describe('pagination helpers', () => {
  it('clamps page and limit into the supported range', () => {
    expect(normalizePageRequest({})).toEqual({ page: 1, limit: 20 });
    expect(normalizePageRequest({ page: 0, limit: 0 })).toEqual({ page: 1, limit: 1 });
    expect(normalizePageRequest({ page: 3.9, limit: 500 })).toEqual({ page: 3, limit: 100 });
  });

  it('computes navigation flags from the total', () => {
    expect(buildPaginationMeta({ page: 2, limit: 10 }, 35)).toEqual({
      page: 2,
      limit: 10,
      total: 35,
      totalPages: 4,
      hasNextPage: true,
      hasPreviousPage: true,
    });
    expect(buildPaginationMeta({ page: 1, limit: 10 }, 0)).toMatchObject({
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    });
  });

  it('slices arrays in memory', () => {
    const result = paginateArray([1, 2, 3, 4, 5], { page: 2, limit: 2 });

    expect(result.items).toEqual([3, 4]);
    expect(result.meta.total).toBe(5);
    expect(result.meta.hasNextPage).toBe(true);
  });

  it('recognises paginated payloads', () => {
    expect(isPaginated({ items: [], meta: { total: 0 } })).toBe(true);
    expect(isPaginated({ items: [] })).toBe(false);
    expect(isPaginated(null)).toBe(false);
    expect(isPaginated('nope')).toBe(false);
  });

  it('applies skip and take to query builders', async () => {
    const query = {
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[{ id: 1 }], 41]),
    } as unknown as SelectQueryBuilder<ObjectLiteral>;

    const result = await paginateQuery(query, { page: 3, limit: 10 });

    expect(query.skip).toHaveBeenCalledWith(20);
    expect(query.take).toHaveBeenCalledWith(10);
    expect(result.meta).toMatchObject({ total: 41, totalPages: 5, hasNextPage: true });
  });

  it('delegates repository pagination to findAndCount', async () => {
    const repository = {
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
    } as unknown as Repository<ObjectLiteral>;

    const result = await paginateRepository(repository, { where: { a: 1 } }, { page: 1, limit: 5 });

    expect(repository.findAndCount).toHaveBeenCalledWith({ where: { a: 1 }, skip: 0, take: 5 });
    expect(result.items).toEqual([]);
    expect(result.meta.totalPages).toBe(0);
  });
});

describe('PaginationQueryDto', () => {
  it('defaults page and limit', async () => {
    const dto = plainToInstance(PaginationQueryDto, {});

    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
    expect(await validate(dto)).toHaveLength(0);
  });

  it('coerces query strings and rejects out of range values', async () => {
    const valid = plainToInstance(PaginationQueryDto, { page: '2', limit: '50' });
    expect(valid.page).toBe(2);
    expect(await validate(valid)).toHaveLength(0);

    const invalid = plainToInstance(PaginationQueryDto, { page: '0', limit: '500' });
    const errors = await validate(invalid);
    expect(errors.map((error) => error.property).sort()).toEqual(['limit', 'page']);
  });
});

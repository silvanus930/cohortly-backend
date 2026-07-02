import {
  type FindManyOptions,
  type ObjectLiteral,
  type Repository,
  type SelectQueryBuilder,
} from 'typeorm';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}

export interface PageRequest {
  page: number;
  limit: number;
}

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export function normalizePageRequest(request: Partial<PageRequest>): PageRequest {
  const page = Math.max(1, Math.trunc(request.page ?? 1));
  const limit = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.trunc(request.limit ?? DEFAULT_PAGE_SIZE)),
  );
  return { page, limit };
}

export function buildPaginationMeta(request: PageRequest, total: number): PaginationMeta {
  const totalPages = total === 0 ? 0 : Math.ceil(total / request.limit);
  return {
    page: request.page,
    limit: request.limit,
    total,
    totalPages,
    hasNextPage: request.page < totalPages,
    hasPreviousPage: request.page > 1 && total > 0,
  };
}

export function isPaginated(value: unknown): value is Paginated<unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as { items?: unknown; meta?: unknown };
  return (
    Array.isArray(candidate.items) &&
    typeof candidate.meta === 'object' &&
    candidate.meta !== null &&
    'total' in candidate.meta
  );
}

export function paginateArray<T>(items: T[], request: Partial<PageRequest>): Paginated<T> {
  const page = normalizePageRequest(request);
  const start = (page.page - 1) * page.limit;
  return {
    items: items.slice(start, start + page.limit),
    meta: buildPaginationMeta(page, items.length),
  };
}

export async function paginateQuery<T extends ObjectLiteral>(
  query: SelectQueryBuilder<T>,
  request: Partial<PageRequest>,
): Promise<Paginated<T>> {
  const page = normalizePageRequest(request);
  const [items, total] = await query
    .skip((page.page - 1) * page.limit)
    .take(page.limit)
    .getManyAndCount();
  return { items, meta: buildPaginationMeta(page, total) };
}

export async function paginateRepository<T extends ObjectLiteral>(
  repository: Repository<T>,
  options: FindManyOptions<T>,
  request: Partial<PageRequest>,
): Promise<Paginated<T>> {
  const page = normalizePageRequest(request);
  const [items, total] = await repository.findAndCount({
    ...options,
    skip: (page.page - 1) * page.limit,
    take: page.limit,
  });
  return { items, meta: buildPaginationMeta(page, total) };
}

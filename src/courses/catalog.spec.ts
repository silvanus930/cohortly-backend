import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserRole } from '../common/enums/user-role.enum';
import { type User } from '../users/entities/user.entity';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { Course } from './entities/course.entity';
import { CourseStatus } from './enums/course.enums';

const learner = { id: 'learner', role: UserRole.LEARNER } as User;
const owner = { id: 'ins-1', role: UserRole.INSTRUCTOR } as User;
const admin = { id: 'admin', role: UserRole.ADMIN } as User;

function builderMock(): Record<string, jest.Mock> {
  const builder: Record<string, jest.Mock> = {};
  for (const method of [
    'leftJoinAndSelect',
    'where',
    'andWhere',
    'orderBy',
    'addOrderBy',
    'take',
    'skip',
  ]) {
    builder[method] = jest.fn().mockReturnValue(builder);
  }
  builder.getManyAndCount = jest.fn().mockResolvedValue([[], 0]);
  builder.getMany = jest.fn().mockResolvedValue([]);
  return builder;
}

describe('CatalogService', () => {
  let service: CatalogService;
  let builder: Record<string, jest.Mock>;
  const repository = { createQueryBuilder: jest.fn(), findOne: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    builder = builderMock();
    repository.createQueryBuilder.mockReturnValue(builder);
    const moduleRef = await Test.createTestingModule({
      providers: [CatalogService, { provide: getRepositoryToken(Course), useValue: repository }],
    }).compile();
    service = moduleRef.get(CatalogService);
  });

  it('only lists published courses and applies filters', async () => {
    await service.list({
      page: 1,
      limit: 12,
      search: 'Type',
      category: 'web',
      level: undefined,
      pricing: undefined,
      tag: 'Node',
      sort: 'popular',
    });

    expect(builder.where).toHaveBeenCalledWith('course.status = :published', {
      published: CourseStatus.PUBLISHED,
    });
    expect(builder.andWhere).toHaveBeenCalledWith(expect.stringContaining('ILIKE :search'), {
      search: '%Type%',
      rawSearch: 'type',
    });
    expect(builder.andWhere).toHaveBeenCalledWith('category.slug = :categorySlug', {
      categorySlug: 'web',
    });
    expect(builder.andWhere).toHaveBeenCalledWith(':tag = ANY(course.tags)', { tag: 'node' });
    expect(builder.orderBy).toHaveBeenCalledWith('course.enrollmentCount', 'DESC');
  });

  it('sorts by title, price and newest', async () => {
    await service.list({ page: 1, limit: 12, sort: 'title' });
    expect(builder.orderBy).toHaveBeenLastCalledWith('course.title', 'ASC');

    await service.list({ page: 1, limit: 12, sort: 'price' });
    expect(builder.orderBy).toHaveBeenLastCalledWith('course.priceCents', 'ASC');

    await service.list({ page: 1, limit: 12, sort: 'newest' });
    expect(builder.orderBy).toHaveBeenLastCalledWith('course.publishedAt', 'DESC');
  });

  it('hides unpublished courses from everyone but staff and the owner', async () => {
    const draft = { id: 'c1', slug: 'draft', status: CourseStatus.DRAFT, instructorId: 'ins-1' };
    repository.findOne.mockResolvedValue(draft);

    await expect(service.findBySlug('draft', undefined)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.findBySlug('draft', learner)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.findBySlug('draft', owner)).resolves.toMatchObject({
      includeContent: true,
    });
    await expect(service.findBySlug('draft', admin)).resolves.toMatchObject({
      includeContent: true,
    });
  });

  it('exposes published courses without content to anonymous viewers', async () => {
    repository.findOne.mockResolvedValue({
      id: 'c1',
      slug: 'live',
      status: CourseStatus.PUBLISHED,
      instructorId: 'ins-1',
    });

    await expect(service.findBySlug('live', undefined)).resolves.toMatchObject({
      includeContent: false,
    });
    await expect(service.findBySlug('live', learner)).resolves.toMatchObject({
      includeContent: false,
    });
  });

  it('consults registered access resolvers for learners', async () => {
    repository.findOne.mockResolvedValue({
      id: 'c1',
      slug: 'live',
      status: CourseStatus.PUBLISHED,
      instructorId: 'ins-1',
    });
    const resolver = jest.fn().mockResolvedValue(true);
    service.registerContentAccessResolver(resolver);

    await expect(service.findBySlug('live', learner)).resolves.toMatchObject({
      includeContent: true,
    });
    expect(resolver).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }), learner);
  });

  it('recommends popular courses excluding ones the viewer teaches', async () => {
    await service.recommend(owner, { limit: 4 });

    expect(builder.take).toHaveBeenCalledWith(4);
    expect(builder.andWhere).toHaveBeenCalledWith('course.instructorId != :viewerId', {
      viewerId: 'ins-1',
    });
    expect(builder.getMany).toHaveBeenCalled();
  });
});

describe('CatalogController', () => {
  it('maps catalog results and passes the viewer through', async () => {
    const course = {
      id: 'c1',
      slug: 'live',
      tags: [],
      modules: [],
      faqs: [],
      instructor: null,
      category: null,
      description: 'Body',
    };
    const catalogService = {
      list: jest.fn().mockResolvedValue({ items: [course], meta: { total: 1 } }),
      recommend: jest.fn().mockResolvedValue([course]),
      findBySlug: jest.fn().mockResolvedValue({ course, includeContent: false }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [CatalogController],
      providers: [{ provide: CatalogService, useValue: catalogService }],
    }).compile();
    const controller = moduleRef.get(CatalogController);

    const page = await controller.list({ page: 1, limit: 12, sort: 'newest' });
    expect(page.items[0].id).toBe('c1');

    const recommended = await controller.recommendations(learner, { limit: 6 });
    expect(catalogService.recommend).toHaveBeenCalledWith(learner, { limit: 6 });
    expect(recommended).toHaveLength(1);

    const detail = await controller.findBySlug(undefined, 'live');
    expect(catalogService.findBySlug).toHaveBeenCalledWith('live', undefined);
    expect(detail.description).toBe('Body');
  });
});

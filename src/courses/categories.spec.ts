import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { Category } from './entities/category.entity';

describe('CategoriesService', () => {
  let service: CategoriesService;
  const repository = {
    find: jest.fn(),
    findOne: jest.fn(),
    exists: jest.fn(),
    create: jest.fn((value: Partial<Category>) => value),
    save: jest.fn((value: Partial<Category>) => Promise.resolve({ id: 'c1', ...value })),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: getRepositoryToken(Category), useValue: repository },
      ],
    }).compile();
    service = moduleRef.get(CategoriesService);
  });

  it('lists categories by position then name', async () => {
    repository.find.mockResolvedValue([]);

    await service.list();

    expect(repository.find).toHaveBeenCalledWith({ order: { position: 'ASC', name: 'ASC' } });
  });

  it('creates a category with a generated slug', async () => {
    repository.exists.mockResolvedValue(false);

    const category = await service.create({ name: '  Web Development ' });

    expect(category).toMatchObject({
      name: 'Web Development',
      slug: 'web-development',
      position: 0,
    });
  });

  it('suffixes the slug when it already exists', async () => {
    repository.exists.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const category = await service.create({ name: 'Data' });

    expect(category.slug).toMatch(/^data-[0-9a-f]{6}$/);
  });

  it('updates fields and trims the name', async () => {
    repository.findOne.mockResolvedValue({ id: 'c1', name: 'Old', slug: 'old', position: 0 });

    const category = await service.update('c1', { name: ' New ', position: 3 });

    expect(category).toMatchObject({ name: 'New', slug: 'old', position: 3 });
  });

  it('removes existing categories and fails for unknown ids', async () => {
    repository.findOne.mockResolvedValueOnce({ id: 'c1' });
    await service.remove('c1');
    expect(repository.remove).toHaveBeenCalledWith({ id: 'c1' });

    repository.findOne.mockResolvedValueOnce(null);
    await expect(service.remove('nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('CategoriesController', () => {
  const categoriesService = {
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
  let controller: CategoriesController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [CategoriesController],
      providers: [{ provide: CategoriesService, useValue: categoriesService }],
    }).compile();
    controller = moduleRef.get(CategoriesController);
  });

  it('delegates every operation to the service', async () => {
    categoriesService.list.mockResolvedValue([{ id: 'c1' }]);
    await expect(controller.list()).resolves.toEqual([{ id: 'c1' }]);

    await controller.create({ name: 'Cloud' });
    expect(categoriesService.create).toHaveBeenCalledWith({ name: 'Cloud' });

    await controller.update('c1', { position: 2 });
    expect(categoriesService.update).toHaveBeenCalledWith('c1', { position: 2 });

    await controller.remove('c1');
    expect(categoriesService.remove).toHaveBeenCalledWith('c1');
  });
});

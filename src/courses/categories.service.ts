import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { stripUndefined } from '../common/utils/strip-undefined';
import { uniqueSlug } from '../common/utils/slugify';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { Category } from './entities/category.entity';

@Injectable()
export class CategoriesService {
  constructor(@InjectRepository(Category) private readonly categories: Repository<Category>) {}

  list(): Promise<Category[]> {
    return this.categories.find({ order: { position: 'ASC', name: 'ASC' } });
  }

  async findByIdOrFail(id: string): Promise<Category> {
    const category = await this.categories.findOne({ where: { id } });
    if (!category) {
      throw new NotFoundException(`Category ${id} was not found`);
    }
    return category;
  }

  async create(dto: CreateCategoryDto): Promise<Category> {
    const slug = await uniqueSlug(dto.name, (candidate) =>
      this.categories.exists({ where: { slug: candidate } }),
    );
    return this.categories.save(
      this.categories.create({
        name: dto.name.trim(),
        slug,
        description: dto.description ?? null,
        position: dto.position ?? 0,
      }),
    );
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<Category> {
    const category = await this.findByIdOrFail(id);
    Object.assign(category, stripUndefined(dto));
    if (dto.name !== undefined) {
      category.name = dto.name.trim();
    }
    return this.categories.save(category);
  }

  async remove(id: string): Promise<void> {
    const category = await this.findByIdOrFail(id);
    await this.categories.remove(category);
  }
}

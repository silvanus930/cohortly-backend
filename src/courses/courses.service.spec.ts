import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserRole } from '../common/enums/user-role.enum';
import { type User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { CategoriesService } from './categories.service';
import { CoursesService, isCourseStaff } from './courses.service';
import { Course } from './entities/course.entity';
import { CoursePricing, CourseStatus } from './enums/course.enums';

const instructor = { id: 'ins-1', role: UserRole.INSTRUCTOR } as User;
const otherInstructor = { id: 'ins-2', role: UserRole.INSTRUCTOR } as User;
const admin = { id: 'adm-1', role: UserRole.ADMIN } as User;

export function fakeCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: 'course-1',
    title: 'Course',
    slug: 'course',
    summary: 'A course summary',
    description: '',
    pricing: CoursePricing.FREE,
    priceCents: 0,
    currency: 'USD',
    status: CourseStatus.DRAFT,
    tags: [],
    enrollmentCount: 0,
    instructorId: 'ins-1',
    categoryId: null,
    ...overrides,
  } as Course;
}

describe('CoursesService', () => {
  let service: CoursesService;
  const repository = {
    findOne: jest.fn(),
    exists: jest.fn(),
    create: jest.fn((value: Partial<Course>) => value),
    save: jest.fn((value: Partial<Course>) => Promise.resolve({ id: 'course-1', ...value })),
    remove: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const categoriesService = { findByIdOrFail: jest.fn() };
  const usersService = { findByIdOrFail: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    repository.exists.mockResolvedValue(false);
    const moduleRef = await Test.createTestingModule({
      providers: [
        CoursesService,
        { provide: getRepositoryToken(Course), useValue: repository },
        { provide: CategoriesService, useValue: categoriesService },
        { provide: UsersService, useValue: usersService },
      ],
    }).compile();
    service = moduleRef.get(CoursesService);
  });

  it('recognises staff roles', () => {
    expect(isCourseStaff(admin)).toBe(true);
    expect(isCourseStaff(instructor)).toBe(false);
  });

  it('lets owners and staff manage a course but not other instructors', () => {
    const course = fakeCourse();
    expect(() => service.assertCanManage(instructor, course)).not.toThrow();
    expect(() => service.assertCanManage(admin, course)).not.toThrow();
    expect(() => service.assertCanManage(otherInstructor, course)).toThrow(ForbiddenException);
  });

  it('creates a draft owned by the acting instructor with a slug and normalised tags', async () => {
    repository.findOne.mockResolvedValue(fakeCourse());

    await service.create(instructor, {
      title: 'Full Stack TypeScript',
      summary: 'Build apps end to end',
      tags: [' Node ', 'node', 'TypeScript'],
    });

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'full-stack-typescript',
        instructorId: 'ins-1',
        status: CourseStatus.DRAFT,
        tags: ['node', 'typescript'],
        pricing: CoursePricing.FREE,
        priceCents: 0,
      }),
    );
  });

  it('requires a positive price for paid courses', async () => {
    await expect(
      service.create(instructor, {
        title: 'Paid',
        summary: 'Costs money',
        pricing: CoursePricing.PAID,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('only lets staff assign another instructor, who must hold a teaching role', async () => {
    await expect(
      service.create(instructor, { title: 'X', summary: 'Assigned away', instructorId: 'ins-2' }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    usersService.findByIdOrFail.mockResolvedValueOnce({ id: 'l1', role: UserRole.LEARNER });
    await expect(
      service.create(admin, { title: 'X', summary: 'Assigned away', instructorId: 'l1' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    usersService.findByIdOrFail.mockResolvedValueOnce({ id: 'ins-2', role: UserRole.INSTRUCTOR });
    repository.findOne.mockResolvedValue(fakeCourse({ instructorId: 'ins-2' }));
    await service.create(admin, { title: 'X', summary: 'Assigned away', instructorId: 'ins-2' });
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ instructorId: 'ins-2' }),
    );
  });

  it('validates categories on create', async () => {
    categoriesService.findByIdOrFail.mockRejectedValueOnce(new BadRequestException('no category'));

    await expect(
      service.create(instructor, { title: 'X', summary: 'With category', categoryId: 'cat-404' }),
    ).rejects.toThrow('no category');
  });

  it('updates fields while keeping ownership checks and price rules', async () => {
    repository.findOne.mockResolvedValue(fakeCourse());

    await expect(
      service.update(otherInstructor, 'course-1', { title: 'Nope' }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await service.update(instructor, 'course-1', {
      title: 'Renamed',
      pricing: CoursePricing.PAID,
      priceCents: 4900,
      currency: 'eur',
    });
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Renamed', priceCents: 4900, currency: 'EUR' }),
    );
  });

  it('archives and only deletes untouched drafts', async () => {
    repository.findOne.mockResolvedValue(fakeCourse());
    const archived = await service.archive(instructor, 'course-1');
    expect(archived.status).toBe(CourseStatus.ARCHIVED);

    repository.findOne.mockResolvedValue(fakeCourse({ status: CourseStatus.PUBLISHED }));
    await expect(service.remove(instructor, 'course-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );

    repository.findOne.mockResolvedValue(fakeCourse({ enrollmentCount: 2 }));
    await expect(service.remove(instructor, 'course-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );

    repository.findOne.mockResolvedValue(fakeCourse());
    await service.remove(instructor, 'course-1');
    expect(repository.remove).toHaveBeenCalled();
  });

  it('scopes managed listings to the instructor unless the actor is staff', async () => {
    const builder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    repository.createQueryBuilder.mockReturnValue(builder);

    await service.listManaged(instructor, { page: 1, limit: 10, instructorId: 'ins-2' });
    expect(builder.andWhere).toHaveBeenCalledWith('course.instructorId = :instructorId', {
      instructorId: 'ins-1',
    });

    builder.andWhere.mockClear();
    await service.listManaged(admin, { page: 1, limit: 10, status: CourseStatus.PUBLISHED });
    expect(builder.andWhere).not.toHaveBeenCalledWith(
      'course.instructorId = :instructorId',
      expect.anything(),
    );
    expect(builder.andWhere).toHaveBeenCalledWith('course.status = :status', {
      status: CourseStatus.PUBLISHED,
    });
  });
});

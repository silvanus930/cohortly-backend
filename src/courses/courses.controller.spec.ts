import { Test } from '@nestjs/testing';
import { UserRole } from '../common/enums/user-role.enum';
import { type User } from '../users/entities/user.entity';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';
import { type Course } from './entities/course.entity';
import { CourseLevel, CoursePricing, CourseStatus } from './enums/course.enums';

const actor = { id: 'ins-1', role: UserRole.INSTRUCTOR } as User;

function course(overrides: Partial<Course> = {}): Course {
  return {
    id: 'course-1',
    title: 'Course',
    slug: 'course',
    summary: 'Summary',
    description: 'Long description',
    level: CourseLevel.BEGINNER,
    pricing: CoursePricing.FREE,
    priceCents: 0,
    currency: 'USD',
    status: CourseStatus.DRAFT,
    coverUrl: null,
    tags: ['ts'],
    durationMinutes: 0,
    enrollmentCount: 0,
    publishedAt: null,
    categoryId: null,
    instructorId: 'ins-1',
    instructor: { id: 'ins-1', firstName: 'Ivo', lastName: 'Teach', avatarUrl: null } as User,
    modules: [
      {
        id: 'm2',
        title: 'Second',
        description: null,
        position: 1,
        lessons: [],
      },
      {
        id: 'm1',
        title: 'First',
        description: null,
        position: 0,
        lessons: [
          { id: 'l2', moduleId: 'm1', title: 'B', position: 1, isPreview: false, materials: [] },
          { id: 'l1', moduleId: 'm1', title: 'A', position: 0, isPreview: true, materials: [] },
        ],
      },
    ],
    faqs: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as Course;
}

describe('CoursesController', () => {
  let controller: CoursesController;
  const coursesService = {
    listManaged: jest.fn(),
    create: jest.fn(),
    findManaged: jest.fn(),
    update: jest.fn(),
    archive: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [CoursesController],
      providers: [{ provide: CoursesService, useValue: coursesService }],
    }).compile();
    controller = moduleRef.get(CoursesController);
  });

  it('maps managed listings to summaries', async () => {
    coursesService.listManaged.mockResolvedValue({
      items: [course()],
      meta: {
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });

    const result = await controller.list(actor, { page: 1, limit: 20 });

    expect(result.items[0]).toMatchObject({
      id: 'course-1',
      instructor: { id: 'ins-1', fullName: 'Ivo Teach' },
      category: null,
    });
    expect(result.items[0]).not.toHaveProperty('modules');
  });

  it('returns the detail view with modules and lessons ordered by position', async () => {
    coursesService.findManaged.mockResolvedValue(course());

    const detail = await controller.findOne(actor, 'course-1');

    expect(detail.modules.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(detail.modules[0].lessons.map((l) => l.id)).toEqual(['l1', 'l2']);
    expect(detail.description).toBe('Long description');
  });

  it('creates, updates, archives and deletes through the service', async () => {
    coursesService.create.mockResolvedValue(course());
    const dto = { title: 'New course', summary: 'Fresh summary' };
    await controller.create(actor, dto);
    expect(coursesService.create).toHaveBeenCalledWith(actor, dto);

    coursesService.update.mockResolvedValue(course({ title: 'Renamed' }));
    const updated = await controller.update(actor, 'course-1', { title: 'Renamed' });
    expect(updated.title).toBe('Renamed');

    coursesService.archive.mockResolvedValue(course({ status: CourseStatus.ARCHIVED }));
    const archived = await controller.archive(actor, 'course-1');
    expect(archived.status).toBe(CourseStatus.ARCHIVED);

    await controller.remove(actor, 'course-1');
    expect(coursesService.remove).toHaveBeenCalledWith(actor, 'course-1');
  });
});

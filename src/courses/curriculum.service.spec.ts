import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserRole } from '../common/enums/user-role.enum';
import { type User } from '../users/entities/user.entity';
import { CoursesService } from './courses.service';
import { CurriculumService } from './curriculum.service';
import { CourseModule } from './entities/course-module.entity';
import { Course } from './entities/course.entity';
import { Lesson } from './entities/lesson.entity';
import { LessonType } from './enums/course.enums';

const actor = { id: 'ins-1', role: UserRole.INSTRUCTOR } as User;
const course = { id: 'course-1', instructorId: 'ins-1' };

function repositoryMock(): Record<string, jest.Mock> {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn((value: object) => value),
    save: jest.fn((value: object) => Promise.resolve({ id: 'new-id', ...value })),
    remove: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
}

describe('CurriculumService', () => {
  let service: CurriculumService;
  const modules = repositoryMock();
  const lessons = repositoryMock();
  const courses = repositoryMock();
  const coursesService = {
    findByIdOrFail: jest.fn().mockResolvedValue(course),
    assertCanManage: jest.fn(),
  };

  function durationQuery(total: string): void {
    lessons.createQueryBuilder.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ total }),
    });
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    coursesService.findByIdOrFail.mockResolvedValue(course);
    durationQuery('0');
    const moduleRef = await Test.createTestingModule({
      providers: [
        CurriculumService,
        { provide: getRepositoryToken(CourseModule), useValue: modules },
        { provide: getRepositoryToken(Lesson), useValue: lessons },
        { provide: getRepositoryToken(Course), useValue: courses },
        { provide: CoursesService, useValue: coursesService },
      ],
    }).compile();
    service = moduleRef.get(CurriculumService);
  });

  it('appends new modules at the end after an ownership check', async () => {
    modules.count.mockResolvedValue(2);

    const module = await service.addModule(actor, 'course-1', { title: '  Intro ' });

    expect(coursesService.assertCanManage).toHaveBeenCalledWith(actor, course);
    expect(module).toMatchObject({
      courseId: 'course-1',
      title: 'Intro',
      position: 2,
      lessons: [],
    });
  });

  it('propagates ownership failures from the courses service', async () => {
    coursesService.assertCanManage.mockImplementationOnce(() => {
      throw new ForbiddenException();
    });

    await expect(service.addModule(actor, 'course-1', { title: 'Intro' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('updates and removes modules, renumbering the survivors', async () => {
    modules.findOne.mockResolvedValue({ id: 'm1', courseId: 'course-1', title: 'Old', course });
    const updated = await service.updateModule(actor, 'm1', { title: ' New ' });
    expect(updated.title).toBe('New');

    modules.find.mockResolvedValueOnce([{ id: 'm2' }, { id: 'm3' }]);
    await service.removeModule(actor, 'm1');
    expect(modules.remove).toHaveBeenCalled();
    expect(modules.update).toHaveBeenCalledWith({ id: 'm2' }, { position: 0 });
    expect(modules.update).toHaveBeenCalledWith({ id: 'm3' }, { position: 1 });
    expect(courses.update).toHaveBeenCalledWith({ id: 'course-1' }, { durationMinutes: 0 });
  });

  it('rejects module lookups that do not exist', async () => {
    modules.findOne.mockResolvedValue(null);

    await expect(service.updateModule(actor, 'missing', { title: 'x' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('requires reorder requests to list every module exactly once', async () => {
    modules.find.mockResolvedValue([{ id: 'm1' }, { id: 'm2' }]);

    await expect(service.reorderModules(actor, 'course-1', ['m1'])).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.reorderModules(actor, 'course-1', ['m1', 'm3'])).rejects.toBeInstanceOf(
      BadRequestException,
    );

    await service.reorderModules(actor, 'course-1', ['m2', 'm1']);
    expect(modules.update).toHaveBeenCalledWith({ id: 'm2' }, { position: 0 });
    expect(modules.update).toHaveBeenCalledWith({ id: 'm1' }, { position: 1 });
  });

  it('adds lessons with the denormalised course id and refreshes the duration', async () => {
    modules.findOne.mockResolvedValue({ id: 'm1', courseId: 'course-1', course });
    lessons.count.mockResolvedValue(1);
    durationQuery('45');

    const lesson = await service.addLesson(actor, 'm1', {
      title: 'Video one',
      type: LessonType.VIDEO,
      durationMinutes: 45,
    });

    expect(lesson).toMatchObject({
      moduleId: 'm1',
      courseId: 'course-1',
      position: 1,
      durationMinutes: 45,
      isPreview: false,
    });
    expect(courses.update).toHaveBeenCalledWith({ id: 'course-1' }, { durationMinutes: 45 });
  });

  it('only recomputes the duration when a lesson duration changes', async () => {
    lessons.findOne.mockResolvedValue({
      id: 'l1',
      moduleId: 'm1',
      courseId: 'course-1',
      title: 'A',
    });

    await service.updateLesson(actor, 'l1', { title: 'Renamed' });
    expect(courses.update).not.toHaveBeenCalled();

    await service.updateLesson(actor, 'l1', { durationMinutes: 10 });
    expect(courses.update).toHaveBeenCalledTimes(1);
  });

  it('removes lessons and renumbers the module', async () => {
    lessons.findOne.mockResolvedValue({ id: 'l1', moduleId: 'm1', courseId: 'course-1' });
    lessons.find.mockResolvedValueOnce([{ id: 'l2' }]);

    await service.removeLesson(actor, 'l1');

    expect(lessons.remove).toHaveBeenCalled();
    expect(lessons.update).toHaveBeenCalledWith({ id: 'l2' }, { position: 0 });
  });

  it('reorders lessons inside a module', async () => {
    modules.findOne.mockResolvedValue({ id: 'm1', courseId: 'course-1', course });
    lessons.find.mockResolvedValueOnce([{ id: 'l1' }, { id: 'l2' }]).mockResolvedValueOnce([]);

    await service.reorderLessons(actor, 'm1', ['l2', 'l1']);

    expect(lessons.update).toHaveBeenCalledWith({ id: 'l2' }, { position: 0 });
    expect(lessons.update).toHaveBeenCalledWith({ id: 'l1' }, { position: 1 });
  });

  it('sums lesson durations into the course', async () => {
    durationQuery('120');

    await expect(service.recomputeDuration('course-1')).resolves.toBe(120);
    expect(courses.update).toHaveBeenCalledWith({ id: 'course-1' }, { durationMinutes: 120 });
  });
});

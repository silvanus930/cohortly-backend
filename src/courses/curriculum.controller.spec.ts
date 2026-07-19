import { Test } from '@nestjs/testing';
import { UserRole } from '../common/enums/user-role.enum';
import { type User } from '../users/entities/user.entity';
import { CurriculumController } from './curriculum.controller';
import { CurriculumService } from './curriculum.service';
import { LessonType } from './enums/course.enums';

const actor = { id: 'ins-1', role: UserRole.INSTRUCTOR } as User;
const lesson = {
  id: 'l1',
  moduleId: 'm1',
  title: 'Lesson',
  type: LessonType.READING,
  position: 0,
  durationMinutes: 5,
  isPreview: false,
  contentUrl: null,
  body: 'text',
  materials: [],
};
const moduleFixture = {
  id: 'm1',
  title: 'Module',
  description: null,
  position: 0,
  lessons: [lesson],
};

describe('CurriculumController', () => {
  let controller: CurriculumController;
  const curriculumService = {
    addModule: jest.fn().mockResolvedValue(moduleFixture),
    reorderModules: jest.fn().mockResolvedValue([moduleFixture]),
    updateModule: jest.fn().mockResolvedValue(moduleFixture),
    removeModule: jest.fn(),
    addLesson: jest.fn().mockResolvedValue(lesson),
    reorderLessons: jest.fn().mockResolvedValue([lesson]),
    updateLesson: jest.fn().mockResolvedValue(lesson),
    removeLesson: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [CurriculumController],
      providers: [{ provide: CurriculumService, useValue: curriculumService }],
    }).compile();
    controller = moduleRef.get(CurriculumController);
  });

  it('creates modules and returns them with their lessons', async () => {
    const result = await controller.addModule(actor, 'course-1', { title: 'Module' });

    expect(curriculumService.addModule).toHaveBeenCalledWith(actor, 'course-1', {
      title: 'Module',
    });
    expect(result.lessons[0]).toMatchObject({ id: 'l1', body: 'text' });
  });

  it('forwards moduleFixture updates, reorders and removals', async () => {
    await controller.updateModule(actor, 'm1', { title: 'Renamed' });
    expect(curriculumService.updateModule).toHaveBeenCalledWith(actor, 'm1', { title: 'Renamed' });

    const reordered = await controller.reorderModules(actor, 'course-1', { ids: ['m1'] });
    expect(curriculumService.reorderModules).toHaveBeenCalledWith(actor, 'course-1', ['m1']);
    expect(reordered).toHaveLength(1);

    await controller.removeModule(actor, 'm1');
    expect(curriculumService.removeModule).toHaveBeenCalledWith(actor, 'm1');
  });

  it('forwards lesson operations', async () => {
    const dto = { title: 'Lesson', type: LessonType.READING };
    await controller.addLesson(actor, 'm1', dto);
    expect(curriculumService.addLesson).toHaveBeenCalledWith(actor, 'm1', dto);

    await controller.updateLesson(actor, 'l1', { isPreview: true });
    expect(curriculumService.updateLesson).toHaveBeenCalledWith(actor, 'l1', { isPreview: true });

    const reordered = await controller.reorderLessons(actor, 'm1', { ids: ['l1'] });
    expect(reordered[0].id).toBe('l1');

    await controller.removeLesson(actor, 'l1');
    expect(curriculumService.removeLesson).toHaveBeenCalledWith(actor, 'l1');
  });
});

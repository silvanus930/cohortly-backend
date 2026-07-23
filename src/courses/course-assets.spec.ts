import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserRole } from '../common/enums/user-role.enum';
import { StorageService } from '../storage/storage.service';
import { type User } from '../users/entities/user.entity';
import { CourseAssetsController } from './course-assets.controller';
import { CourseAssetsService } from './course-assets.service';
import { CoursesService } from './courses.service';
import { CurriculumService } from './curriculum.service';
import { CourseFaq } from './entities/course-faq.entity';
import { Course } from './entities/course.entity';
import { LessonMaterial } from './entities/lesson-material.entity';

const actor = { id: 'ins-1', role: UserRole.INSTRUCTOR } as User;
const upload = {
  key: 'courses/c1/cover/x.png',
  uploadUrl: 'https://signed',
  publicUrl: 'https://cdn/courses/c1/cover/x.png',
  method: 'PUT' as const,
  headers: {},
  expiresInSeconds: 600,
};

function repositoryMock(): Record<string, jest.Mock> {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn((value: object) => value),
    save: jest.fn((value: object) => Promise.resolve({ id: 'new-id', ...value })),
    remove: jest.fn(),
    update: jest.fn(),
  };
}

describe('CourseAssetsService', () => {
  let service: CourseAssetsService;
  const courses = repositoryMock();
  const materials = repositoryMock();
  const faqs = repositoryMock();
  const coursesService = {
    findByIdOrFail: jest.fn().mockResolvedValue({ id: 'c1', instructorId: 'ins-1' }),
    assertCanManage: jest.fn(),
  };
  const curriculumService = {
    findLessonForManage: jest.fn().mockResolvedValue({ id: 'l1', courseId: 'c1' }),
  };
  const storageService = {
    createPresignedUpload: jest.fn().mockResolvedValue(upload),
    deleteObject: jest.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    coursesService.findByIdOrFail.mockResolvedValue({ id: 'c1', instructorId: 'ins-1' });
    curriculumService.findLessonForManage.mockResolvedValue({ id: 'l1', courseId: 'c1' });
    storageService.createPresignedUpload.mockResolvedValue(upload);
    const moduleRef = await Test.createTestingModule({
      providers: [
        CourseAssetsService,
        { provide: getRepositoryToken(Course), useValue: courses },
        { provide: getRepositoryToken(LessonMaterial), useValue: materials },
        { provide: getRepositoryToken(CourseFaq), useValue: faqs },
        { provide: CoursesService, useValue: coursesService },
        { provide: CurriculumService, useValue: curriculumService },
        { provide: StorageService, useValue: storageService },
      ],
    }).compile();
    service = moduleRef.get(CourseAssetsService);
  });

  it('presigns a cover upload and stores the resulting url', async () => {
    const result = await service.presignCover(actor, 'c1', {
      fileName: 'cover.png',
      mimeType: 'image/png',
      sizeBytes: 100,
    });

    expect(storageService.createPresignedUpload).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'image', folder: 'courses/c1/cover' }),
    );
    expect(courses.save).toHaveBeenCalledWith(
      expect.objectContaining({ coverUrl: upload.publicUrl }),
    );
    expect(result.upload).toBe(upload);
  });

  it('chooses the video rule for video materials and records the file', async () => {
    materials.count.mockResolvedValue(2);

    const result = await service.addMaterial(actor, 'l1', {
      title: ' Lecture ',
      fileName: 'lecture.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 5000,
    });

    expect(storageService.createPresignedUpload).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'video', folder: 'courses/c1/lessons/l1' }),
    );
    expect(result.material).toMatchObject({
      lessonId: 'l1',
      title: 'Lecture',
      fileKey: upload.key,
      fileUrl: upload.publicUrl,
      sizeBytes: '5000',
      position: 2,
    });
  });

  it('removes materials after an ownership check and deletes the object', async () => {
    materials.findOne.mockResolvedValue({ id: 'm1', lessonId: 'l1', fileKey: 'k' });

    await service.removeMaterial(actor, 'm1');

    expect(curriculumService.findLessonForManage).toHaveBeenCalledWith(actor, 'l1');
    expect(materials.remove).toHaveBeenCalled();
    expect(storageService.deleteObject).toHaveBeenCalledWith('k');

    materials.findOne.mockResolvedValue(null);
    await expect(service.removeMaterial(actor, 'nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('adds, updates, removes and reorders faqs', async () => {
    faqs.count.mockResolvedValue(1);
    const faq = await service.addFaq(actor, 'c1', { question: ' Why? ', answer: ' Because. ' });
    expect(faq).toMatchObject({
      courseId: 'c1',
      question: 'Why?',
      answer: 'Because.',
      position: 1,
    });

    faqs.findOne.mockResolvedValue({ id: 'f1', courseId: 'c1', question: 'Q', answer: 'A' });
    const updated = await service.updateFaq(actor, 'f1', { answer: 'B' });
    expect(updated.answer).toBe('B');

    faqs.find.mockResolvedValueOnce([{ id: 'f2' }]);
    await service.removeFaq(actor, 'f1');
    expect(faqs.remove).toHaveBeenCalled();
    expect(faqs.update).toHaveBeenCalledWith({ id: 'f2' }, { position: 0 });

    faqs.find.mockResolvedValueOnce([{ id: 'f1' }, { id: 'f2' }]).mockResolvedValueOnce([]);
    await service.reorderFaqs(actor, 'c1', ['f2', 'f1']);
    expect(faqs.update).toHaveBeenCalledWith({ id: 'f2' }, { position: 0 });

    faqs.find.mockResolvedValueOnce([{ id: 'f1' }, { id: 'f2' }]);
    await expect(service.reorderFaqs(actor, 'c1', ['f1'])).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('CourseAssetsController', () => {
  it('maps service results into response shapes', async () => {
    const assetsService = {
      presignCover: jest.fn().mockResolvedValue({
        upload,
        course: { id: 'c1', tags: [], instructor: null, category: null },
      }),
      addMaterial: jest.fn().mockResolvedValue({
        upload,
        material: {
          id: 'm1',
          title: 'T',
          fileUrl: 'u',
          mimeType: 'x/y',
          sizeBytes: '10',
          position: 0,
        },
      }),
      removeMaterial: jest.fn(),
      addFaq: jest.fn().mockResolvedValue({ id: 'f1', question: 'Q', answer: 'A', position: 0 }),
      reorderFaqs: jest.fn().mockResolvedValue([]),
      updateFaq: jest.fn().mockResolvedValue({ id: 'f1', question: 'Q', answer: 'B', position: 0 }),
      removeFaq: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [CourseAssetsController],
      providers: [{ provide: CourseAssetsService, useValue: assetsService }],
    }).compile();
    const controller = moduleRef.get(CourseAssetsController);
    const file = { fileName: 'a.png', mimeType: 'image/png', sizeBytes: 1 };

    const cover = await controller.presignCover(actor, 'c1', file);
    expect(cover.course.id).toBe('c1');

    const material = await controller.addMaterial(actor, 'l1', { ...file, title: 'T' });
    expect(material.material.sizeBytes).toBe(10);

    const faq = await controller.addFaq(actor, 'c1', { question: 'Q', answer: 'A' });
    expect(faq.id).toBe('f1');

    await controller.removeFaq(actor, 'f1');
    expect(assetsService.removeFaq).toHaveBeenCalledWith(actor, 'f1');
  });
});

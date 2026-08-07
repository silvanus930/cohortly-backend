import { Logger, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserRole } from '../common/enums/user-role.enum';
import { type User } from '../users/entities/user.entity';
import { Notification, NotificationType } from './entities/notification.entity';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

const user = { id: 'u1', role: UserRole.LEARNER } as User;

describe('NotificationsService', () => {
  let service: NotificationsService;
  const repository = {
    create: jest.fn((value: object) => value),
    save: jest.fn((value: object) =>
      Promise.resolve({ id: 'n1', createdAt: new Date(), ...value }),
    ),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    count: jest.fn().mockResolvedValue(2),
    findOne: jest.fn(),
    update: jest.fn().mockResolvedValue({ affected: 3 }),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: getRepositoryToken(Notification), useValue: repository },
      ],
    }).compile();
    service = moduleRef.get(NotificationsService);
  });

  it('stores notifications with a bounded title and default data', async () => {
    const notification = await service.create('u1', {
      type: NotificationType.GENERIC,
      title: 'x'.repeat(250),
      body: 'Body',
    });

    expect(notification.title).toHaveLength(200);
    expect(notification.data).toEqual({});
    expect(notification.readAt).toBeNull();
  });

  it('swallows inbox failures in the fire and forget variant', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    repository.save.mockRejectedValueOnce(new Error('db down'));

    service.notify('u1', { type: NotificationType.GENERIC, title: 't', body: 'b' });
    await new Promise((resolve) => setImmediate(resolve));

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('db down'));
    warn.mockRestore();
  });

  it('lists only unread rows when asked', async () => {
    await service.listMine(user, { page: 1, limit: 20, unreadOnly: true });

    expect(repository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'u1', readAt: expect.anything() as unknown }),
      }),
    );
  });

  it('marks single and all notifications read', async () => {
    repository.findOne.mockResolvedValue({ id: 'n1', userId: 'u1', readAt: null });
    const read = await service.markRead(user, 'n1');
    expect(read.readAt).toBeInstanceOf(Date);
    expect(repository.save).toHaveBeenCalled();

    repository.findOne.mockResolvedValue(null);
    await expect(service.markRead(user, 'nope')).rejects.toBeInstanceOf(NotFoundException);

    await expect(service.markAllRead(user)).resolves.toBe(3);
  });

  it('deletes own notifications only', async () => {
    await service.remove(user, 'n1');
    expect(repository.delete).toHaveBeenCalledWith({ id: 'n1', userId: 'u1' });

    repository.delete.mockResolvedValueOnce({ affected: 0 });
    await expect(service.remove(user, 'other')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('NotificationsController', () => {
  it('maps inbox rows and counts', async () => {
    const notification = {
      id: 'n1',
      type: NotificationType.GRADE_POSTED,
      title: 'Graded',
      body: 'You scored 90',
      data: { courseId: 'c1' },
      readAt: null,
      createdAt: new Date(),
      userId: 'u1',
    };
    const notificationsService = {
      listMine: jest.fn().mockResolvedValue({ items: [notification], meta: { total: 1 } }),
      unreadCount: jest.fn().mockResolvedValue(1),
      markRead: jest.fn().mockResolvedValue({ ...notification, readAt: new Date() }),
      markAllRead: jest.fn().mockResolvedValue(4),
      remove: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [{ provide: NotificationsService, useValue: notificationsService }],
    }).compile();
    const controller = moduleRef.get(NotificationsController);

    const page = await controller.list(user, { page: 1, limit: 20, unreadOnly: false });
    expect(page.items[0]).not.toHaveProperty('userId');
    expect(page.items[0].data).toEqual({ courseId: 'c1' });

    await expect(controller.unreadCount(user)).resolves.toEqual({ unread: 1 });
    const read = await controller.markRead(user, 'n1');
    expect(read.readAt).toBeInstanceOf(Date);
    await expect(controller.markAllRead(user)).resolves.toEqual({ updated: 4 });
    await controller.remove(user, 'n1');
    expect(notificationsService.remove).toHaveBeenCalledWith(user, 'n1');
  });
});

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { type Paginated, paginateRepository } from '../common/pagination/pagination';
import { type User } from '../users/entities/user.entity';
import { type ListNotificationsQueryDto } from './dto/notification.dto';
import { Notification, NotificationType } from './entities/notification.entity';

export interface NotificationInput {
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * In-app notification inbox. Email delivery for the important events lives
 * next to the producing module; this service only owns the inbox rows.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification) private readonly notifications: Repository<Notification>,
  ) {}

  async create(userId: string, input: NotificationInput): Promise<Notification> {
    return this.notifications.save(
      this.notifications.create({
        userId,
        type: input.type,
        title: input.title.slice(0, 200),
        body: input.body,
        data: input.data ?? {},
        readAt: null,
      }),
    );
  }

  /** Never rejects, for callers whose own flow must not fail on inbox errors. */
  notify(userId: string, input: NotificationInput): Promise<void> {
    return this.create(userId, input)
      .then(() => undefined)
      .catch((error: unknown) => {
        this.logger.warn(`Could not store notification for ${userId}: ${String(error)}`);
      });
  }

  listMine(user: User, query: ListNotificationsQueryDto): Promise<Paginated<Notification>> {
    return paginateRepository(
      this.notifications,
      {
        where: { userId: user.id, ...(query.unreadOnly ? { readAt: IsNull() } : {}) },
        order: { createdAt: 'DESC' },
      },
      query,
    );
  }

  unreadCount(user: User): Promise<number> {
    return this.notifications.count({ where: { userId: user.id, readAt: IsNull() } });
  }

  async markRead(user: User, id: string): Promise<Notification> {
    const notification = await this.notifications.findOne({ where: { id, userId: user.id } });
    if (!notification) {
      throw new NotFoundException(`Notification ${id} was not found`);
    }
    if (!notification.readAt) {
      notification.readAt = new Date();
      await this.notifications.save(notification);
    }
    return notification;
  }

  async markAllRead(user: User): Promise<number> {
    const result = await this.notifications.update(
      { userId: user.id, readAt: IsNull() },
      { readAt: new Date() },
    );
    return result.affected ?? 0;
  }

  async remove(user: User, id: string): Promise<void> {
    const result = await this.notifications.delete({ id, userId: user.id });
    if (!result.affected) {
      throw new NotFoundException(`Notification ${id} was not found`);
    }
  }
}

export { NotificationType };

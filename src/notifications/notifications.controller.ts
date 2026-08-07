import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { type Paginated } from '../common/pagination/pagination';
import { type User } from '../users/entities/user.entity';
import { ListNotificationsQueryDto } from './dto/notification.dto';
import { type Notification, type NotificationType } from './entities/notification.entity';
import { NotificationsService } from './notifications.service';

export interface NotificationDto {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown>;
  readAt: Date | null;
  createdAt: Date;
}

export function toNotificationDto(notification: Notification): NotificationDto {
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    data: notification.data,
    readAt: notification.readAt,
    createdAt: notification.createdAt,
  };
}

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Your inbox, newest first' })
  async list(
    @CurrentUser() user: User,
    @Query() query: ListNotificationsQueryDto,
  ): Promise<Paginated<NotificationDto>> {
    const page = await this.notificationsService.listMine(user, query);
    return { items: page.items.map(toNotificationDto), meta: page.meta };
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: User): Promise<{ unread: number }> {
    return { unread: await this.notificationsService.unreadCount(user) };
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  async markRead(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<NotificationDto> {
    return toNotificationDto(await this.notificationsService.markRead(user, id));
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  async markAllRead(@CurrentUser() user: User): Promise<{ updated: number }> {
    return { updated: await this.notificationsService.markAllRead(user) };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.notificationsService.remove(user, id);
  }
}

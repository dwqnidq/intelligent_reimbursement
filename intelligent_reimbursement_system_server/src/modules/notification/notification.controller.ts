import { Controller, Get, Patch, Post, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { NotificationService } from './notification.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly service: NotificationService) {}

  @ApiOperation({ summary: '我的站内通知' })
  @Get('mine')
  async listMine(
    @CurrentUser('id') userId: string,
    @Query('unread_only') unreadOnly?: string,
  ) {
    const list = await this.service.listMine(userId, unreadOnly === '1');
    const unread = await this.service.unreadCount(userId);
    return { list, unread };
  }

  @ApiOperation({ summary: '标记单条已读' })
  @Patch(':id/read')
  markRead(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.markRead(id, userId);
  }

  @ApiOperation({ summary: '全部标记已读' })
  @Post('read-all')
  markAllRead(@CurrentUser('id') userId: string) {
    return this.service.markAllRead(userId);
  }
}

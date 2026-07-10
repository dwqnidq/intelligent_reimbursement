import { Module } from '@nestjs/common';
import { FeishuBotController } from './feishu-bot.controller';
import { FeishuBotService } from './feishu-bot.service';

@Module({
  controllers: [FeishuBotController],
  providers: [FeishuBotService],
})
export class FeishuBotModule {}

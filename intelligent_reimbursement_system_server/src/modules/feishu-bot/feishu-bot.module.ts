import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FeishuBotController } from './feishu-bot.controller';
import { FeishuBotService } from './feishu-bot.service';
import { BotSession, BotSessionSchema } from '../../schemas/bot_session.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BotSession.name, schema: BotSessionSchema },
    ]),
  ],
  controllers: [FeishuBotController],
  providers: [FeishuBotService],
})
export class FeishuBotModule {}

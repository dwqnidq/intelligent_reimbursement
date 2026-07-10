import { Controller, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../../common/public.decorator';
import { FeishuBotService } from './feishu-bot.service';

@Controller('feishu-bot')
export class FeishuBotController {
  constructor(private readonly botService: FeishuBotService) {}

  @Public()
  @Post('event')
  onEvent(@Req() req: Request, @Res() res: Response): void {
    this.botService.handleEventHttp(req, res);
  }

  @Public()
  @Post('card')
  onCard(@Req() req: Request, @Res() res: Response): void {
    this.botService.handleCardHttp(req, res);
  }
}

import {
  Controller,
  Post,
  Body,
  UseGuards,
  Res,
  UseInterceptors,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Injectable,
} from '@nestjs/common';
import type { Response } from 'express';
import { IsString, IsArray, IsOptional } from 'class-validator';
import { Observable } from 'rxjs';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Injectable()
class NoWrapInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle();
  }
}

class ChatDto {
  @IsString()
  message: string;

  @IsOptional()
  @IsArray()
  files?: string[];
}

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  @UseInterceptors(NoWrapInterceptor)
  async chat(@Body() chatDto: ChatDto, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();
    const stream = this.aiService.chatStream(chatDto.message, chatDto.files);

    stream.subscribe({
      next: (event) => {
        res.write(`data: ${event.data}\n\n`);
      },
      error: () => {
        res.write(
          `data: ${JSON.stringify({ done: true, type: 'error', message: '处理失败' })}\n\n`,
        );
        res.end();
      },
      complete: () => {
        res.end();
      },
    });
  }
}

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
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { User } from '../../schemas/user.schema';
import { Role } from '../../schemas/role.schema';

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
  constructor(
    private readonly aiService: AiService,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Role.name) private roleModel: Model<Role>,
  ) {}

  @Post('chat')
  @UseInterceptors(NoWrapInterceptor)
  async chat(
    @Body() chatDto: ChatDto,
    @Res() res: Response,
    @CurrentUser('id') userId: string,
  ) {
    // 通过用户 id 找到 roles 字段（ObjectId 数组），再去 roles 集合查 name
    const user = await this.userModel.findById(userId).select('roles').lean();
    const roleIds = user?.roles ?? [];
    const roles = await this.roleModel
      .find({ _id: { $in: roleIds } })
      .select('name')
      .lean();
    const isAdmin = roles.some((r) => r.name === 'admin');

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    const stream = this.aiService.chatStream(
      chatDto.message,
      chatDto.files,
      isAdmin,
    );

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

import {
  Controller,
  Post,
  Body,
  UseGuards,
  Res,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
} from '@nestjs/swagger';
import { IsString, IsArray, IsOptional } from 'class-validator';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { User } from '../../schemas/user.schema';
import { Role } from '../../schemas/role.schema';
import { NoWrapResponseInterceptor } from '../../common/no-wrap.interceptor';

class ChatDto {
  @ApiProperty({ description: '用户消息内容', example: '帮我分析本月报销数据' })
  @IsString()
  message: string;

  @ApiProperty({
    description: '附件文件 URL 数组',
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  files?: string[];
}

@ApiTags('AI 智能助手')
@ApiBearerAuth()
@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(
    private readonly aiService: AiService,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Role.name) private roleModel: Model<Role>,
  ) {}

  @ApiOperation({ summary: 'AI 流式对话（SSE）' })
  @Post('chat')
  @UseInterceptors(NoWrapResponseInterceptor)
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

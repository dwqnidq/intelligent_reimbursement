import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Query,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { type Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiConsumes,
} from '@nestjs/swagger';
import { UserService } from './user.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { FileService } from '../file/file.service';
import { Public } from '../../common/public.decorator';

@ApiTags('Users')
@Controller('users')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly fileService: FileService,
  ) {}

  private setAuthCookie(res: Response, token: string) {
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('access_token', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });
  }

  @Public()
  @ApiOperation({ summary: '飞书 OAuth 回调，用 code 换 token 并重定向前端' })
  @Get('auth/feishu')
  async feishuCallback(@Query('code') code: string, @Res() res: Response) {
    const token = await this.userService.feishuLogin(code);
    this.setAuthCookie(res, token);
    const frontendUrl =
      process.env.NODE_ENV === 'production'
        ? process.env.FRONTEND_URL || 'http://localhost:5173'
        : 'http://localhost:5173';
    return res.redirect(`${frontendUrl}/set-token`);
  }

  @ApiOperation({ summary: '飞书登录后前端用 token 拉取完整用户信息' })
  @Get('auth/feishu/session')
  feishuSession(@CurrentUser('id') userId: string) {
    return this.userService.getSessionByToken(userId);
  }

  @Public()
  @ApiOperation({ summary: '用户注册' })
  @Post()
  register(@Body() dto: RegisterDto) {
    return this.userService.register(dto);
  }

  @Public()
  @ApiOperation({ summary: '用户登录，返回 JWT token 及权限菜单' })
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const payload = await this.userService.login(dto);
    this.setAuthCookie(res, payload.token);
    return payload;
  }

  @ApiOperation({ summary: '获取当前登录用户信息' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@CurrentUser('id') userId: string) {
    return this.userService.getProfile(userId);
  }

  @ApiOperation({ summary: '修改密码' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Patch('password')
  changePassword(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.userService.changePassword(userId, dto);
  }

  @ApiOperation({ summary: '设置登录密码（飞书账号首次设置）' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Patch('password/setup')
  setPassword(
    @CurrentUser('id') userId: string,
    @Body() dto: SetPasswordDto,
  ) {
    return this.userService.setPassword(userId, dto);
  }

  @ApiOperation({ summary: '上传头像，自动更新用户 avatar 字段' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Patch('avatar')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 2 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          return cb(new Error('只支持图片格式'), false);
        }
        cb(null, true);
      },
    }),
  )
  async updateAvatar(
    @CurrentUser('id') userId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const { url } = await this.fileService.upload(file, userId, 'avatar');
    return this.userService.updateAvatar(userId, url);
  }
}

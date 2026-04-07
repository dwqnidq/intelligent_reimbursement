import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
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

  @Public()
  @ApiOperation({ summary: '用户注册' })
  @Post()
  register(@Body() dto: RegisterDto) {
    return this.userService.register(dto);
  }

  @Public()
  @ApiOperation({ summary: '用户登录，返回 JWT token 及权限菜单' })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.userService.login(dto);
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

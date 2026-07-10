import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @ApiProperty({ description: '昵称' })
  @IsString()
  @IsNotEmpty({ message: '昵称不能为空' })
  @MaxLength(50)
  username: string;

  @ApiProperty({ description: '邮箱' })
  @IsEmail({}, { message: '请输入有效的邮箱地址' })
  email: string;
}

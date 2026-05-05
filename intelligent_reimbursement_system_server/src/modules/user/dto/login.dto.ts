import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ description: '手机号或邮箱' })
  @IsString()
  username: string;

  @ApiProperty()
  @IsString()
  password: string;
}

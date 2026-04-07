import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({ description: '旧密码' })
  @IsString()
  old_password: string;

  @ApiProperty({ description: '新密码，至少6位' })
  @IsString()
  @MinLength(6)
  new_password: string;
}

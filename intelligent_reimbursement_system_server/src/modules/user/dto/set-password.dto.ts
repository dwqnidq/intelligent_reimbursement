import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetPasswordDto {
  @ApiProperty({ description: '新密码，至少6位' })
  @IsString()
  @MinLength(6)
  new_password: string;
}

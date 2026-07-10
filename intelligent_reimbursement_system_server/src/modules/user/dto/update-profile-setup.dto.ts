import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdateProfileSetupDto {
  @ApiProperty({ description: '公司 ID' })
  @IsString()
  @IsNotEmpty({ message: '请选择公司' })
  company_id: string;

  @ApiProperty({ description: '收款账户' })
  @IsString()
  @IsNotEmpty({ message: '收款账户不能为空' })
  @MaxLength(200)
  payment_account: string;
}

import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePaymentAccountDto {
  @ApiProperty({ description: '收款账户（银行卡号等）' })
  @IsString()
  @IsNotEmpty()
  payment_account: string;
}

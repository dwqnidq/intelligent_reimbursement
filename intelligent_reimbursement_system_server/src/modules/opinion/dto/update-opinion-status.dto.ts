import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min, Max } from 'class-validator';

export class UpdateOpinionStatusDto {
  @ApiProperty({ description: '状态：0待处理 1已处理 2已关闭', enum: [0, 1, 2] })
  @IsInt()
  @Min(0)
  @Max(2)
  status: number;
}


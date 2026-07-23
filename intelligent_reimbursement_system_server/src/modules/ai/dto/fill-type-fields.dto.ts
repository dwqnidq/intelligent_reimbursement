import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class FillTypeFieldsDto {
  @ApiProperty({
    description: '所选报销类型 JSON（含 label/name/code/fields）',
  })
  @IsString()
  typeJson: string;

  @ApiProperty({ description: '原票 OCR 文本' })
  @IsString()
  ocrText: string;

  @ApiProperty({
    description: '已知金额（可选，供模型/兜底写入金额字段）',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  knownAmount?: number;
}

import {
  IsString,
  IsOptional,
  IsArray,
  ArrayMinSize,
  IsObject,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateReimbursementDto {
  @ApiProperty()
  @IsString()
  applicant_name: string;

  @ApiProperty()
  @IsString()
  category: string;

  @ApiProperty({
    description: '每条报销明细一条记录，对应前端一行表单；至少 1 条',
    type: 'array',
    items: { type: 'object', additionalProperties: true },
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsObject({ each: true })
  details: Record<string, unknown>[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  attachments?: string[];

  @ApiProperty()
  @IsString()
  apply_date: string;
}

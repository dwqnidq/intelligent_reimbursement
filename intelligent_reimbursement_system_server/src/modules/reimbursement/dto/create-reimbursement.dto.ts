import {
  IsString,
  IsOptional,
  IsArray,
  ArrayMinSize,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InvoiceInfoInputDto {
  @ApiPropertyOptional({ description: '发票号码' })
  @IsOptional()
  @IsString()
  invoice_number?: string;

  @ApiPropertyOptional({ description: '发票抬头（购买方/公司名称）' })
  @IsOptional()
  @IsString()
  invoice_title?: string;

  @ApiPropertyOptional({ description: '开票日期，建议 YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  invoice_date?: string;

  @ApiPropertyOptional({ description: '开票人' })
  @IsOptional()
  @IsString()
  issuer?: string;
}

export class CreateReimbursementDto {
  @ApiProperty()
  @IsString()
  applicant_name: string;

  @ApiProperty()
  @IsString()
  category: string;

  @ApiProperty({ description: '部门名称（中文）' })
  @IsString()
  department_name: string;

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

  @ApiPropertyOptional({ description: '发票号码（用于去重校验，兼容字段）' })
  @IsOptional()
  @IsString()
  invoice_number?: string;

  @ApiPropertyOptional({ description: '发票信息（号码、抬头、开票日期、开票人）' })
  @IsOptional()
  @ValidateNested()
  @Type(() => InvoiceInfoInputDto)
  invoice_info?: InvoiceInfoInputDto;
}

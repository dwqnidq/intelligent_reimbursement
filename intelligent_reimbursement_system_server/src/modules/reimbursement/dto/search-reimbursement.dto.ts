import { IsOptional, IsString, IsNumber } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class SearchReimbursementDto {
  @ApiPropertyOptional({
    description: '报销类型 code，支持逗号分隔多个，如 purchase,travel',
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    description: '审核状态，支持逗号分隔多个，如 pending,approved',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description: '员工 ID，逗号分隔多个',
  })
  @IsOptional()
  @IsString()
  employee_ids?: string;

  @ApiPropertyOptional({
    description: '部门 ID，逗号分隔多个（含所选部门及全部子部门）',
  })
  @IsOptional()
  @IsString()
  department_ids?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  min_amount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  max_amount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  start_date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  end_date?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  size?: number;
}

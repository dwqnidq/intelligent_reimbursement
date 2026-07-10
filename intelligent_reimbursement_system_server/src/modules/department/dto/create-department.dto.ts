import { IsString, IsOptional, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDepartmentDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  code: string;

  @ApiPropertyOptional({ description: '上级部门 ID，根部门不传' })
  @IsOptional()
  @IsString()
  parent_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  manager_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  status?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  sort?: number;
}

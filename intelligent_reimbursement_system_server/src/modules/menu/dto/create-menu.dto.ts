import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsIn } from 'class-validator';

export class CreateMenuDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  path?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  component?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  sort?: number;

  @ApiProperty({ enum: ['directory', 'menu', 'button'] })
  @IsIn(['directory', 'menu', 'button'])
  type: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  parent_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  permission?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  visible?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  status?: number;
}

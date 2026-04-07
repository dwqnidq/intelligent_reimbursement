import {
  IsString,
  IsNumber,
  IsObject,
  IsOptional,
  IsArray,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateReimbursementDto {
  @ApiProperty()
  @IsString()
  applicant_name: string;

  @ApiProperty()
  @IsString()
  category: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  amount?: number;

  @ApiProperty()
  @IsObject()
  detail: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  attachments?: string[];

  @ApiProperty()
  @IsString()
  apply_date: string;
}

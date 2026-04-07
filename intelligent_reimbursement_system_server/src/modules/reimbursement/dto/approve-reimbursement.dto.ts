import { IsString, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApproveReimbursementDto {
  @ApiProperty({ enum: ['approved', 'rejected', 'withdrawn'] })
  @IsString()
  @IsIn(['approved', 'rejected', 'withdrawn'])
  status: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reject_reason?: string;
}

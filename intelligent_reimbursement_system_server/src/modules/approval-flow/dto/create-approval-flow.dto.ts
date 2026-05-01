import { IsString, IsBoolean, IsArray, ValidateNested, IsNumber, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class ApprovalNodeDto {
  @ApiProperty()
  @IsString()
  node_id: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  approver_id: string;

  @ApiProperty({ enum: ['countersign', 'orsign'] })
  @IsString()
  sign_type: string;

  @ApiProperty()
  @IsNumber()
  sort: number;
}

export class CreateApprovalFlowDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  type_code: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiProperty({ type: [ApprovalNodeDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ApprovalNodeDto)
  nodes: ApprovalNodeDto[];
}

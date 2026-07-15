import { IsString, IsBoolean, IsArray, ValidateNested, IsNumber, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class ApprovalNodeDto {
  @ApiProperty()
  @IsString()
  node_id: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  approver_ids: string[];

  @ApiPropertyOptional({
    type: [Boolean],
    description: '与 approver_ids 等长，是否向该审批人推送；缺省按 true',
  })
  @IsOptional()
  @IsArray()
  @IsBoolean({ each: true })
  notify_flags?: boolean[];

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  amount_min?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  amount_max?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  priority?: number;
}

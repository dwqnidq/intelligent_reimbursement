import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateReimbursementFormSettingsDto {
  @ApiProperty({ description: '是否展示「智能识别填写」' })
  @IsBoolean()
  smart_fill_enabled: boolean;

  @ApiProperty({ description: '是否展示「手动填写」' })
  @IsBoolean()
  manual_fill_enabled: boolean;
}

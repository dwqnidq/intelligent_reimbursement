import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ReimbursementFormSettingsService } from './reimbursement-form-settings.service';
import { UpdateReimbursementFormSettingsDto } from './dto/update-reimbursement-form-settings.dto';

@ApiTags('ReimbursementFormSettings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reimbursement-form-settings')
export class ReimbursementFormSettingsController {
  constructor(private readonly service: ReimbursementFormSettingsService) {}

  @ApiOperation({ summary: '获取报销单填写方式展示配置（登录用户可读）' })
  @Get()
  getSettings() {
    return this.service.getSettings();
  }

  @ApiOperation({ summary: '更新报销单填写方式展示配置（仅管理员）' })
  @Put()
  updateSettings(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateReimbursementFormSettingsDto,
  ) {
    return this.service.updateSettings(userId, dto);
  }
}

import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { ApprovalRecordService } from './approval-record.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@ApiTags('Approvals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('approvals')
export class ApprovalRecordController {
  constructor(private readonly service: ApprovalRecordService) {}

  @ApiOperation({ summary: '我的待审批列表' })
  @Get('mine')
  findMyPending(@CurrentUser('id') userId: string) {
    return this.service.findMyPending(userId);
  }

  @ApiOperation({ summary: '我的审批历史' })
  @Get('history')
  findMyHistory(@CurrentUser('id') userId: string) {
    return this.service.findMyHistory(userId);
  }

  @ApiOperation({ summary: '根据报销单ID获取审批记录' })
  @Get('record/:reimbursementId')
  findByReimbursementId(@Param('reimbursementId') reimbursementId: string) {
    return this.service.findByReimbursementId(reimbursementId);
  }

  @ApiOperation({ summary: '审批通过' })
  @Post(':id/approve')
  async approve(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body('comment') comment?: string,
  ) {
    const { record } = await this.service.approve(id, userId, comment);
    return record;
  }

  @ApiOperation({ summary: '审批驳回' })
  @Post(':id/reject')
  async reject(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body('comment') comment?: string,
  ) {
    const { record } = await this.service.reject(id, userId, comment);
    return record;
  }

  @ApiOperation({ summary: '转审' })
  @Post(':id/transfer')
  async transfer(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body('target_employee_id') targetEmployeeId: string,
    @Body('comment') comment?: string,
  ) {
    const { record } = await this.service.transfer(
      id,
      userId,
      targetEmployeeId,
      comment,
    );
    return record;
  }
}

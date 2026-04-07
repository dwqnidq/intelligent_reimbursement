import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { ReimbursementService } from './reimbursement.service';
import { CreateReimbursementDto } from './dto/create-reimbursement.dto';
import { ApproveReimbursementDto } from './dto/approve-reimbursement.dto';
import { SearchReimbursementDto } from './dto/search-reimbursement.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@ApiTags('Reimbursements')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reimbursements')
export class ReimbursementController {
  constructor(private readonly service: ReimbursementService) {}

  @ApiOperation({ summary: '导出报销单 Excel，支持与列表相同的筛选参数' })
  @Get('export')
  async exportExcel(
    @CurrentUser('id') userId: string,
    @Query() query: SearchReimbursementDto,
    @Res() res: Response,
  ) {
    const buffer = await this.service.exportExcel(userId, query);
    const filename = `reimbursements_${Date.now()}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @ApiOperation({
    summary:
      '获取报销单列表，支持筛选（类型、状态、金额、日期）和分页，管理员可见全部',
  })
  @Get()
  findAll(
    @CurrentUser('id') userId: string,
    @Query() query: SearchReimbursementDto,
  ): Promise<unknown> {
    return this.service.getList(userId, query);
  }

  @ApiOperation({ summary: '提交报销申请' })
  @Post()
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateReimbursementDto,
  ) {
    return this.service.create(userId, dto);
  }

  @ApiOperation({
    summary:
      '更新报销单状态（approved 审批通过 / rejected 驳回 / withdrawn 撤回）',
  })
  @Patch(':id')
  updateStatus(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: ApproveReimbursementDto,
  ) {
    if (dto.status === 'withdrawn') {
      return this.service.withdraw(userId, id);
    }
    return this.service.approve(userId, id, dto);
  }
}

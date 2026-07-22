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
  ParseArrayPipe,
  UseInterceptors,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';
import { ReimbursementService } from './reimbursement.service';
import { CreateReimbursementDto } from './dto/create-reimbursement.dto';
import { ApproveReimbursementDto } from './dto/approve-reimbursement.dto';
import { SearchReimbursementDto } from './dto/search-reimbursement.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { NoWrapResponseInterceptor } from '../../common/no-wrap.interceptor';
import { takeExportJob } from './export-job.store';

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

  @ApiOperation({ summary: '导出报销单 Excel（SSE 进度推送）' })
  @Get('export/stream')
  @UseInterceptors(NoWrapResponseInterceptor)
  async exportExcelStream(
    @CurrentUser('id') userId: string,
    @Query() query: SearchReimbursementDto,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const writeEvent = (payload: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    try {
      const result = await this.service.exportExcelWithJob(
        userId,
        query,
        (progress) => {
          writeEvent({ type: 'progress', ...progress });
        },
      );
      writeEvent({ type: 'done', token: result.token, filename: result.filename });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '导出失败，请稍后重试';
      writeEvent({ type: 'error', message });
    } finally {
      res.end();
    }
  }

  @ApiOperation({ summary: '下载已完成的导出文件（一次性 token）' })
  @Get('export/file/:token')
  @UseInterceptors(NoWrapResponseInterceptor)
  downloadExportFile(@Param('token') token: string, @Res() res: Response) {
    const job = takeExportJob(token);
    if (!job) {
      throw new NotFoundException('导出文件不存在或已过期');
    }
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${job.filename}"`,
    );
    res.send(job.buffer);
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

  @ApiOperation({
    summary:
      '获取报销单树形列表（按 submission_batch_id 分组），支持筛选和分页，管理员可见全部',
  })
  @Get('tree')
  findTree(
    @CurrentUser('id') userId: string,
    @Query() query: SearchReimbursementDto,
  ): Promise<unknown> {
    return this.service.getTreeList(userId, query);
  }

  @ApiOperation({ summary: '检查发票号码是否已报销（去重）' })
  @Get('invoice-check')
  checkInvoiceNumber(@Query('number') number: string) {
    return this.service.isInvoiceNumberAvailable(number ?? '');
  }

  @ApiOperation({
    summary:
      '获取单条报销单详情（申请人、审批权限用户、或该单审批流中的审批人）',
  })
  @Get(':id')
  findOne(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.service.getOne(userId, id);
  }

  @ApiOperation({
    summary: '提交报销申请',
    description:
      '请求体为 JSON 数组；数组每一项包含 applicant_name、category、apply_date、attachments、details。每个元素内的 details 数组中每一条写入一条报销记录。',
  })
  @ApiBody({ type: CreateReimbursementDto, isArray: true })
  @Post()
  create(
    @CurrentUser('id') userId: string,
    @Body(
      new ParseArrayPipe({
        items: CreateReimbursementDto,
        whitelist: true,
      }),
    )
    dtos: CreateReimbursementDto[],
  ) {
    return this.service.createBatch(userId, dtos);
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

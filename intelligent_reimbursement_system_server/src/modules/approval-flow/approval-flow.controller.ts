import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { ApprovalFlowService } from './approval-flow.service';
import { CreateApprovalFlowDto } from './dto/create-approval-flow.dto';
import { UpdateApprovalFlowDto } from './dto/update-approval-flow.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import mongoose from 'mongoose';

@ApiTags('ApprovalFlows')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('approval-flows')
export class ApprovalFlowController {
  constructor(private readonly service: ApprovalFlowService) {}

  @ApiOperation({ summary: '获取审批流列表' })
  @Get()
  findAll() {
    return this.service.findAll();
  }

  @ApiOperation({ summary: '获取审批流详情' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @ApiOperation({ summary: '创建审批流' })
  @Post()
  create(@Body() dto: CreateApprovalFlowDto, @CurrentUser('id') userId: string) {
    console.log('Creating approval flow with data:', dto, 'by user:', userId);
    dto.nodes.forEach((node, index) => {
      const node_id: string = new mongoose.Types.ObjectId().toString();
      node.node_id = node_id;
    });
    return this.service.create(dto, userId);
  }

  @ApiOperation({ summary: '更新审批流' })
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateApprovalFlowDto) {
    return this.service.update(id, dto);
  }

  @ApiOperation({ summary: '开启/关闭审批流' })
  @Patch(':id/toggle')
  toggle(@Param('id') id: string) {
    return this.service.toggle(id);
  }

  @ApiOperation({ summary: '删除审批流' })
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @ApiOperation({ summary: '批量更新审批流优先级（拖拽排序）' })
  @Post('reorder')
  reorder(@Body() body: { ids: string[] }) {
    return this.service.reorder(body.ids);
  }
}

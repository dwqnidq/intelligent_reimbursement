import { Controller, Post, Get, Body, Patch, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { OpinionService } from './opinion.service';
import { CreateOpinionDto } from './dto/create-opinion.dto';
import { UpdateOpinionStatusDto } from './dto/update-opinion-status.dto';
import { CurrentUser } from '../auth/current-user.decorator';

@ApiTags('意见反馈')
@ApiBearerAuth()
@Controller('v1/opinions')
export class OpinionController {
  constructor(private readonly opinionService: OpinionService) {}

  @ApiOperation({ summary: '提交意见反馈' })
  @Post()
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateOpinionDto) {
    return this.opinionService.create(user.id, dto);
  }

  @ApiOperation({ summary: '获取所有意见反馈（管理员）' })
  @Get()
  findAll() {
    return this.opinionService.findAll();
  }

  @ApiOperation({ summary: '获取我的意见反馈' })
  @Get('mine')
  findMine(@CurrentUser() user: { id: string }) {
    return this.opinionService.findMine(user.id);
  }

  @ApiOperation({ summary: '修改意见反馈状态（管理员/意见管理员）' })
  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateOpinionStatusDto,
  ) {
    return this.opinionService.updateStatus(user.id, id, dto.status);
  }
}

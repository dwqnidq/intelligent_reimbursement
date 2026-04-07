import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { ReimbursementTypeService } from './reimbursement-type.service';
import { CreateReimbursementTypeDto } from './dto/create-reimbursement-type.dto';
import { UpdateReimbursementTypeDto } from './dto/update-reimbursement-type.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@ApiTags('ReimbursementTypes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reimbursement-types')
export class ReimbursementTypeController {
  constructor(private readonly service: ReimbursementTypeService) {}

  @ApiOperation({
    summary: '获取报销类型列表，管理员返回全部，普通用户只返回启用的',
  })
  @Get()
  findAll(@CurrentUser('id') userId: string) {
    return this.service.findAll(userId);
  }

  @ApiOperation({ summary: '创建报销类型（code 和 label 不可重复）' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() dto: CreateReimbursementTypeDto) {
    return this.service.create(dto);
  }

  @ApiOperation({ summary: '更新报销类型' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateReimbursementTypeDto) {
    return this.service.update(id, dto);
  }

  @ApiOperation({ summary: '删除报销类型' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

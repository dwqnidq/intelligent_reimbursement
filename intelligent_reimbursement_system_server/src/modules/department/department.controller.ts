import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { DepartmentService } from './department.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('Departments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('departments')
export class DepartmentController {
  constructor(private readonly service: DepartmentService) {}

  @ApiOperation({ summary: '获取部门列表（tree=true 返回树形）' })
  @Get()
  findAll(
    @Query('status') status?: string,
    @Query('tree') tree?: string,
  ) {
    const query: { status?: number; tree?: boolean } = {};
    if (status !== undefined) query.status = Number(status);
    if (tree === 'true') query.tree = true;
    return this.service.findAll(Object.keys(query).length ? query : undefined);
  }

  @ApiOperation({ summary: '获取部门名称选项（直接拉取飞书通讯录，带缓存）' })
  @Get('name-options')
  findNameOptions() {
    return this.service.findNameOptions();
  }

  @ApiOperation({ summary: '创建部门' })
  @Post()
  create(@Body() dto: CreateDepartmentDto) {
    return this.service.create(dto);
  }

  @ApiOperation({ summary: '更新部门' })
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDepartmentDto) {
    return this.service.update(id, dto);
  }

  @ApiOperation({ summary: '删除部门' })
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

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
import { EmployeeService } from './employee.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('Employees')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('employees')
export class EmployeeController {
  constructor(private readonly service: EmployeeService) {}

  @ApiOperation({ summary: '获取员工列表（分页、搜索、部门筛选）' })
  @Get()
  findAll(
    @Query('name') name?: string,
    @Query('dept_id') dept_id?: string,
    @Query('page') page?: string,
    @Query('page_size') page_size?: string,
  ) {
    return this.service.findAll({
      name,
      dept_id,
      page: page ? Number(page) : undefined,
      page_size: page_size ? Number(page_size) : undefined,
    });
  }

  @ApiOperation({ summary: '创建员工' })
  @Post()
  create(@Body() dto: CreateEmployeeDto) {
    return this.service.create(dto);
  }

  @ApiOperation({ summary: '更新员工' })
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
    return this.service.update(id, dto);
  }

  @ApiOperation({ summary: '删除员工' })
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

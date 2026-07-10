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
import { CompanyService } from './company.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@ApiTags('Companies')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('companies')
export class CompanyController {
  constructor(private readonly service: CompanyService) {}

  @ApiOperation({ summary: '获取公司名称选项（登录用户可选）' })
  @Get('name-options')
  findNameOptions() {
    return this.service.findNameOptions();
  }

  @ApiOperation({ summary: '获取公司列表（仅管理员）' })
  @Get()
  findAll(@CurrentUser('id') userId: string) {
    return this.service.findAll(userId);
  }

  @ApiOperation({ summary: '创建公司（仅管理员）' })
  @Post()
  create(@CurrentUser('id') userId: string, @Body() dto: CreateCompanyDto) {
    return this.service.create(userId, dto);
  }

  @ApiOperation({ summary: '更新公司（仅管理员）' })
  @Put(':id')
  update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCompanyDto,
  ) {
    return this.service.update(userId, id, dto);
  }

  @ApiOperation({ summary: '删除公司（仅管理员）' })
  @Delete(':id')
  remove(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.service.remove(userId, id);
  }
}

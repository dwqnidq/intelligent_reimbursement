import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { RoleService } from './role.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('Roles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('roles')
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @ApiOperation({ summary: '获取所有角色' })
  @Get()
  findAll() {
    return this.roleService.findAll();
  }

  @ApiOperation({ summary: '获取单个角色' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.roleService.findOne(id);
  }

  @ApiOperation({ summary: '创建角色' })
  @Post()
  create(@Body() dto: CreateRoleDto) {
    return this.roleService.create(dto);
  }

  @ApiOperation({ summary: '更新角色' })
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.roleService.update(id, dto);
  }

  @ApiOperation({ summary: '删除角色' })
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.roleService.remove(id);
  }

  @ApiOperation({ summary: '分配权限给角色' })
  @Put(':id/permissions')
  assignPermissions(
    @Param('id') id: string,
    @Body('permissions') permissions: string[],
  ) {
    return this.roleService.assignPermissions(id, permissions);
  }

  @ApiOperation({ summary: '分配菜单给角色' })
  @Put(':id/menus')
  assignMenus(
    @Param('id') id: string,
    @Body('menus') menus: string[],
  ) {
    return this.roleService.assignMenus(id, menus);
  }
}

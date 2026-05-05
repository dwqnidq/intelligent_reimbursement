import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Role } from '../../schemas/role.schema';
import { User } from '../../schemas/user.schema';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Injectable()
export class RoleService {
  constructor(
    @InjectModel(Role.name) private roleModel: Model<Role>,
    @InjectModel(User.name) private userModel: Model<User>,
  ) {}

  async findAll() {
    return this.roleModel
      .find()
      .populate('permissions')
      .populate('menus')
      .sort({ createdAt: -1 });
  }

  async findOne(id: string) {
    const role = await this.roleModel
      .findById(id)
      .populate('permissions')
      .populate('menus');
    if (!role) throw new NotFoundException('角色不存在');
    return role;
  }

  async create(dto: CreateRoleDto) {
    const exists = await this.roleModel.findOne({
      $or: [{ name: dto.name }, { label: dto.label }],
    });
    if (exists) throw new ConflictException('角色名或标识已存在');

    return this.roleModel.create({
      name: dto.name,
      label: dto.label,
      description: dto.description,
      status: dto.status ?? 1,
      permissions: dto.permissions ?? [],
      menus: dto.menus ?? [],
    });
  }

  async update(id: string, dto: UpdateRoleDto) {
    const role = await this.roleModel.findById(id);
    if (!role) throw new NotFoundException('角色不存在');

    if (dto.name || dto.label) {
      const conflict = await this.roleModel.findOne({
        _id: { $ne: id },
        $or: [
          ...(dto.name ? [{ name: dto.name }] : []),
          ...(dto.label ? [{ label: dto.label }] : []),
        ],
      });
      if (conflict) throw new ConflictException('角色名或标识已存在');
    }

    const updated = await this.roleModel.findByIdAndUpdate(
      id,
      { $set: dto },
      { returnDocument: 'after' },
    );
    return updated;
  }

  async remove(id: string) {
    const role = await this.roleModel.findById(id);
    if (!role) throw new NotFoundException('角色不存在');

    const userCount = await this.userModel.countDocuments({ roles: id });
    if (userCount > 0) {
      throw new BadRequestException(
        `该角色下有 ${userCount} 个用户，请先移除用户的角色后再删除`,
      );
    }

    await this.roleModel.findByIdAndDelete(id);
    return { message: '角色已删除' };
  }

  async assignPermissions(id: string, permissionIds: string[]) {
    const role = await this.roleModel.findById(id);
    if (!role) throw new NotFoundException('角色不存在');

    role.permissions = permissionIds as any;
    await role.save();
    return role.populate('permissions');
  }

  async assignMenus(id: string, menuIds: string[]) {
    const role = await this.roleModel.findById(id);
    if (!role) throw new NotFoundException('角色不存在');

    role.menus = menuIds as any;
    await role.save();
    return role.populate('menus');
  }
}

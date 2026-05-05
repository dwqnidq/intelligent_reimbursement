import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Menu } from '../../schemas/menu.schema';
import { Role } from '../../schemas/role.schema';
import { CreateMenuDto } from './dto/create-menu.dto';
import { UpdateMenuDto } from './dto/update-menu.dto';

@Injectable()
export class MenuService {
  constructor(
    @InjectModel(Menu.name) private menuModel: Model<Menu>,
    @InjectModel(Role.name) private roleModel: Model<Role>,
  ) {}

  async findAll() {
    const menus = await this.menuModel
      .find()
      .populate('permission')
      .sort({ sort: 1, createdAt: 1 });
    return this.buildTree(menus);
  }

  async findAllFlat() {
    return this.menuModel
      .find()
      .populate('permission')
      .sort({ sort: 1, createdAt: 1 });
  }

  async findOne(id: string) {
    const menu = await this.menuModel.findById(id).populate('permission');
    if (!menu) throw new NotFoundException('菜单不存在');
    return menu;
  }

  async create(dto: CreateMenuDto) {
    return this.menuModel.create({
      name: dto.name,
      path: dto.path,
      component: dto.component,
      icon: dto.icon,
      sort: dto.sort ?? 0,
      type: dto.type,
      parent_id: dto.parent_id || undefined,
      permission: dto.permission || undefined,
      visible: dto.visible ?? 1,
      status: dto.status ?? 1,
    });
  }

  async update(id: string, dto: UpdateMenuDto) {
    const menu = await this.menuModel.findById(id);
    if (!menu) throw new NotFoundException('菜单不存在');

    if (dto.parent_id === id) {
      throw new BadRequestException('父菜单不能是自己');
    }

    const updated = await this.menuModel.findByIdAndUpdate(
      id,
      { $set: dto },
      { returnDocument: 'after' },
    );
    return updated;
  }

  async remove(id: string) {
    const menu = await this.menuModel.findById(id);
    if (!menu) throw new NotFoundException('菜单不存在');

    // Check if any child menus exist
    const children = await this.menuModel.countDocuments({ parent_id: id });
    if (children > 0) {
      throw new BadRequestException('该菜单下有子菜单，请先删除子菜单');
    }

    await this.menuModel.findByIdAndDelete(id);

    // Remove from all roles
    await this.roleModel.updateMany({}, { $pull: { menus: id } });

    return { message: '菜单已删除' };
  }

  private buildTree(menus: Menu[], parentId: string | null = null): any[] {
    return menus
      .filter(
        (m) => String(m.parent_id ?? null) === String(parentId ?? null),
      )
      .map((m) => ({
        ...m.toObject(),
        children: this.buildTree(menus, String(m._id)),
      }));
  }
}

import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { User } from '../../schemas/user.schema';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

interface PopulatedPermission {
  _id: string;
  name: string;
}

interface PopulatedMenu {
  _id: string;
  parent_id: string | null;
  sort: number;
  toObject(): Record<string, unknown>;
}

interface PopulatedRole {
  permissions: PopulatedPermission[];
  menus: PopulatedMenu[];
}

@Injectable()
export class UserService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    private jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const exists = await this.userModel.findOne({
      $or: [{ username: dto.username }, { email: dto.email }],
    });
    if (exists) throw new ConflictException('用户名或邮箱已存在');

    const user = await this.userModel.create(dto);
    return { id: user._id, username: user.username };
  }

  async login(dto: LoginDto) {
    const user = await this.userModel
      .findOne({ $or: [{ username: dto.username }, { email: dto.username }] })
      .populate({
        path: 'roles',
        populate: [{ path: 'permissions' }, { path: 'menus' }],
      });

    if (!user || !(await user.comparePassword(dto.password))) {
      throw new UnauthorizedException('账号或密码错误');
    }
    if (user.status === 0) {
      throw new ForbiddenException('账号已被禁用');
    }

    const permissionMap = new Map<string, PopulatedPermission>();
    const menuMap = new Map<string, PopulatedMenu>();
    for (const role of user.roles as unknown as PopulatedRole[]) {
      for (const p of role.permissions) permissionMap.set(String(p._id), p);
      for (const m of role.menus) menuMap.set(String(m._id), m);
    }

    const permissions = [...permissionMap.values()].map((p) => p.name);
    const menus = this.buildMenuTree([...menuMap.values()]);

    const token = this.jwtService.sign({
      id: user._id,
      username: user.username,
    });

    return {
      token,
      user: {
        id: user._id,
        username: user.username,
        real_name: user.real_name,
        email: user.email,
        avatar: user.avatar ?? '',
      },
      permissions,
      menus,
    };
  }

  async getProfile(userId: string) {
    const user = await this.userModel
      .findById(userId)
      .select('-password')
      .populate('roles');
    if (!user) throw new NotFoundException('用户不存在');
    return user;
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('用户不存在');
    if (!(await user.comparePassword(dto.old_password))) {
      throw new UnauthorizedException('旧密码错误');
    }
    user.password = dto.new_password;
    await user.save();
    return { message: '密码修改成功' };
  }

  async updateAvatar(userId: string, avatarUrl: string) {
    await this.userModel.findByIdAndUpdate(userId, {
      $set: { avatar: avatarUrl },
    });
    return { avatar: avatarUrl };
  }

  private buildMenuTree(
    menus: PopulatedMenu[],
    parentId: string | null = null,
  ): Record<string, unknown>[] {
    return menus
      .filter((m) => String(m.parent_id) === String(parentId))
      .sort((a, b) => a.sort - b.sort)
      .map((m) => ({
        ...m.toObject(),
        children: this.buildMenuTree(menus, m._id),
      }));
  }
}

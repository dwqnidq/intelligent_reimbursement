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
import { randomBytes } from 'crypto';
import { User } from '../../schemas/user.schema';
import { FeishuUser } from '../../schemas/feishu-user.schema';
import { Role } from '../../schemas/role.schema';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { SetPasswordDto } from './dto/set-password.dto';

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
    @InjectModel(FeishuUser.name) private feishuUserModel: Model<FeishuUser>,
    @InjectModel(Role.name) private roleModel: Model<Role>,
    private jwtService: JwtService,
  ) {}

  private async getDefaultEmployeeRoleId() {
    const role =
      (await this.roleModel.findOne({ name: 'employee' }).select('_id').lean()) ||
      (await this.roleModel.findOne({ label: '员工' }).select('_id').lean());
    if (!role?._id) {
      throw new NotFoundException('未找到默认员工角色，请先初始化 employee/员工 角色');
    }
    return role._id;
  }

  async register(dto: RegisterDto) {
    const exists = await this.userModel.findOne({
      $or: [{ username: dto.username }, { email: dto.email }],
    });
    if (exists) throw new ConflictException('用户名或邮箱已存在');

    const defaultRoleId = await this.getDefaultEmployeeRoleId();
    const user = await this.userModel.create({
      ...dto,
      roles: [defaultRoleId],
      auth_provider: 'local',
      password_login_enabled: true,
    });
    return { id: user._id, username: user.username };
  }

  async login(dto: LoginDto) {
    const user = await this.userModel
      .findOne({ $or: [{ username: dto.username }, { email: dto.username }] })
      .populate({
        path: 'roles',
        populate: [{ path: 'permissions' }, { path: 'menus' }],
      });

    if (!user) {
      throw new UnauthorizedException('账号或密码错误');
    }
    if (user.password_login_enabled === false) {
      throw new ForbiddenException('该账号请使用飞书登录，或先在个人中心设置登录密码');
    }
    if (!(await user.comparePassword(dto.password))) {
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

  async setPassword(userId: string, dto: SetPasswordDto) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('用户不存在');
    user.password = dto.new_password;
    user.password_login_enabled = true;
    user.auth_provider = 'local';
    await user.save();
    return { message: '登录密码设置成功' };
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

  async feishuLogin(code: string): Promise<string> {
    const appId = process.env.FEISHU_APP_ID;
    const appSecret = process.env.FEISHU_APP_SECRET;
    // 1. 用 code 换 access_token
    const tokenRes = await fetch(
      'https://open.feishu.cn/open-apis/authen/v2/oauth/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          code,
          client_id: appId,
          client_secret: appSecret,
          redirect_uri: 'http://localhost:3000/api/users/auth/feishu',
        }),
      },
    );
    const tokenData = (await tokenRes.json()) as {
      code: number;
      access_token: string;
    };
    console.log('tokenData', tokenData);
    if (tokenData.code !== 0) throw new UnauthorizedException('飞书授权失败');
    const accessToken = tokenData.access_token;

    // 2. 用 access_token 获取用户信息
    const userRes = await fetch(
      'https://open.feishu.cn/open-apis/authen/v1/user_info',
      {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );
    const userInfo = (await userRes.json()) as {
      code: number;
      data: {
        open_id: string;
        union_id: string;
        name: string;
        email: string;
        mobile: string;
        avatar_url: string;
      };
    };
    if (userInfo.code !== 0)
      throw new UnauthorizedException('获取飞书用户信息失败');
    const { open_id, union_id, name, email, mobile, avatar_url } = userInfo.data;
    const defaultRoleId = await this.getDefaultEmployeeRoleId();
    const normalizedEmail = email?.trim().toLowerCase() || `${open_id}@feishu.local`;

    // 3. 先通过映射表定位主用户
    const feishuUser = await this.feishuUserModel.findOne({ openId: open_id });
    let user = feishuUser?.uid ? await this.userModel.findById(feishuUser.uid) : null;

    // 4. 如果映射不存在，尝试按邮箱绑定已有用户，否则自动开户
    if (!user && normalizedEmail) {
      user = await this.userModel.findOne({ email: normalizedEmail });
    }
    if (!user) {
      const generatedPassword = randomBytes(24).toString('hex');
      const username = `feishu_${open_id}`;
      user = await this.userModel.create({
        username,
        password: generatedPassword,
        email: normalizedEmail,
        real_name: name || '飞书用户',
        phone: mobile || '',
        avatar: avatar_url || '',
        roles: [defaultRoleId],
        auth_provider: 'feishu',
        password_login_enabled: false,
      });
    }

    // 5. 维护飞书映射记录（仅身份映射与资料快照）
    await this.feishuUserModel.findOneAndUpdate(
      { openId: open_id },
      {
        openId: open_id,
        unionId: union_id,
        name,
        email: normalizedEmail,
        mobile,
        avatar_url,
        uid: user._id,
      },
      { upsert: true, new: true },
    );

    // 6. 基于主用户签发 token
    return this.jwtService.sign(
      { id: user._id, username: user.username },
      { expiresIn: '7d' },
    );
  }

  async getSessionByToken(userId: string) {
    const user = await this.userModel
      .findById(userId)
      .populate({
        path: 'roles',
        populate: [{ path: 'permissions' }, { path: 'menus' }],
      });
    if (!user) throw new NotFoundException('用户不存在');

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
}

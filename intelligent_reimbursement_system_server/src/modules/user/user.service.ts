import {
  Injectable,
  Logger,
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import { User } from '../../schemas/user.schema';
import { FeishuUser } from '../../schemas/feishu_user.schema';
import { Role } from '../../schemas/role.schema';
import { Employee } from '../../schemas/employee.schema';
import { Department } from '../../schemas/department.schema';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { UpdatePaymentAccountDto } from './dto/update-payment-account.dto';
import { UpdateProfileSetupDto } from './dto/update-profile-setup.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CompanyService } from '../company/company.service';
import {
  buildPhoneLoginCandidates,
  isPhoneLike,
  normalizePhone,
} from '../../common/phone.util';
import { shouldBackfillDepartmentManager } from './feishu-department-manager.util';
import { resolveAuthUserDepartment } from './resolve-auth-user-department.util';
import { shouldAssignEmployeeDepartment } from './should-assign-employee-department.util';
import { decideApprovalRoleChange } from './decide-approval-role-change.util';

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
  name: string;
  permissions: PopulatedPermission[];
  menus: PopulatedMenu[];
}

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(FeishuUser.name) private feishuUserModel: Model<FeishuUser>,
    @InjectModel(Role.name) private roleModel: Model<Role>,
    @InjectModel(Employee.name) private employeeModel: Model<Employee>,
    @InjectModel(Department.name) private deptModel: Model<Department>,
    private jwtService: JwtService,
    private companyService: CompanyService,
  ) {}

  private signAccessToken(payload: { id: string; username: string }) {
    return this.jwtService.sign(payload);
  }

  /**
   * 按启用部门负责人关系对账 approval 角色：是负责人则确保有，否则移除。
   * 失败不阻断登录/会话。
   */
  private async reconcileApprovalRole(userId: string): Promise<void> {
    try {
      const approvalRole = await this.roleModel
        .findOne({ name: 'approval' })
        .select('_id')
        .lean();
      if (!approvalRole?._id) {
        this.logger.warn('未找到 approval 角色，跳过审批员角色对账');
        return;
      }
      const approvalRoleId = String(approvalRole._id);

      const employee = await this.employeeModel
        .findOne({ uid: userId })
        .select('_id')
        .lean();
      const isManager = employee?._id
        ? Boolean(
            await this.deptModel.exists({
              manager_id: String(employee._id),
              status: 1,
            }),
          )
        : false;

      const user = await this.userModel.findById(userId).select('roles').lean();
      if (!user) return;

      const hasApprovalRole = (user.roles ?? [])
        .map((roleId) => String(roleId))
        .includes(approvalRoleId);
      const decision = decideApprovalRoleChange({ isManager, hasApprovalRole });

      if (decision === 'add') {
        await this.userModel.updateOne(
          { _id: userId },
          { $addToSet: { roles: approvalRoleId } },
        );
      } else if (decision === 'remove') {
        await this.userModel.updateOne(
          { _id: userId },
          { $pull: { roles: approvalRoleId } },
        );
      }
    } catch (err) {
      this.logger.error(
        `审批员角色对账失败 userId=${userId}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  private signRefreshToken(payload: { id: string; username: string }) {
    return this.jwtService.sign(
      { ...payload, type: 'refresh' },
      { expiresIn: '30d' },
    );
  }

  private async resolveEmployeeDepartmentName(
    userId: string,
  ): Promise<string> {
    const employee = await this.employeeModel
      .findOne({ uid: userId })
      .select('dept_id')
      .lean();
    const deptId = employee?.dept_id ? String(employee.dept_id) : '';
    if (!deptId) return '';
    const department = await this.deptModel
      .findById(deptId)
      .select('name')
      .lean();
    return (department?.name ?? '').trim();
  }

  private async toAuthUser(user: User) {
    const department = resolveAuthUserDepartment({
      employeeDepartmentName: await this.resolveEmployeeDepartmentName(
        String(user._id),
      ),
      userDepartment: user.department,
    });
    return {
      id: user._id,
      username: user.username,
      real_name: user.real_name,
      email: user.email,
      avatar: user.avatar ?? '',
      password_login_enabled: user.password_login_enabled,
      payment_account: user.payment_account ?? '',
      company_id: user.company_id ?? '',
      company_name: user.company_name ?? '',
      department,
    };
  }

  private async getDefaultEmployeeRoleId() {
    const role =
      (await this.roleModel.findOne({ name: 'employee' }).select('_id').lean()) ||
      (await this.roleModel.findOne({ label: '员工' }).select('_id').lean());
    if (!role?._id) {
      throw new NotFoundException('未找到默认员工角色，请先初始化 employee/员工 角色');
    }
    return String(role._id);
  }

  async register(dto: RegisterDto) {
    const exists = await this.userModel.findOne({
      $or: [{ username: dto.username }, { email: dto.email }],
    });
    if (exists) throw new ConflictException('用户名或邮箱已存在');

    const defaultRoleId = await this.getDefaultEmployeeRoleId();
    const normalizedPhone = normalizePhone(dto.phone);
    const user = await this.userModel.create({
      ...dto,
      phone: normalizedPhone,
      roles: [defaultRoleId],
      auth_provider: 'local',
      password_login_enabled: true,
    });

    // 自动创建员工记录
    const existingEmp = await this.employeeModel.findOne({ uid: String(user._id) });
    if (!existingEmp) {
      const empCount = await this.employeeModel.countDocuments();
      const employeeNo = `EM${String(empCount + 1).padStart(5, '0')}`;
      await this.employeeModel.create({
        employee_no: employeeNo,
        name: dto.real_name || dto.username,
        gender: 0,
        phone: normalizedPhone,
        status: 1,
        uid: String(user._id),
      });
    }

    return { id: user._id, username: user.username };
  }

  async findAll() {
    return this.userModel
      .find()
      .select('-password')
      .populate('roles')
      .sort({ createdAt: -1 });
  }

  async assignRoles(userId: string, roleIds: string[]) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('用户不存在');
    user.roles = roleIds as any;
    await user.save();
    return this.userModel.findById(userId).select('-password').populate('roles');
  }

  async login(dto: LoginDto) {
    const identifier = (dto.username ?? '').trim();
    const emailCandidate = identifier.toLowerCase();
    const phoneCandidates = isPhoneLike(identifier)
      ? buildPhoneLoginCandidates(identifier)
      : [];

    const user = await this.userModel
      .findOne({
        $or: [
          { username: identifier },
          { email: emailCandidate },
          ...(phoneCandidates.length ? [{ phone: { $in: phoneCandidates } }] : []),
        ],
      })
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

    const userId = String(user._id);
    await this.reconcileApprovalRole(userId);

    const sessionUser = await this.userModel.findById(userId).populate({
      path: 'roles',
      populate: [{ path: 'permissions' }, { path: 'menus' }],
    });
    if (!sessionUser) {
      throw new UnauthorizedException('账号或密码错误');
    }

    const populatedRoles = sessionUser.roles as unknown as PopulatedRole[];
    const permissionMap = new Map<string, PopulatedPermission>();
    const menuMap = new Map<string, PopulatedMenu>();
    for (const role of populatedRoles) {
      for (const p of role.permissions) permissionMap.set(String(p._id), p);
      for (const m of role.menus) menuMap.set(String(m._id), m);
    }

    const permissions = [...permissionMap.values()].map((p) => p.name);
    const menus = this.buildMenuTree([...menuMap.values()]);
    const roles = populatedRoles.map((r) => r.name).filter(Boolean);

    const token = this.signAccessToken({
      id: userId,
      username: sessionUser.username,
    });
    const refreshToken = this.signRefreshToken({
      id: userId,
      username: sessionUser.username,
    });

    return {
      token,
      refreshToken,
      user: await this.toAuthUser(sessionUser),
      permissions,
      roles,
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

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const username = dto.username.trim();
    const email = dto.email.trim().toLowerCase();
    if (!username) {
      throw new BadRequestException('昵称不能为空');
    }

    const conflict = await this.userModel.findOne({
      _id: { $ne: userId },
      $or: [{ username }, { email }],
    });
    if (conflict) {
      if (conflict.username === username) {
        throw new ConflictException('昵称已被使用');
      }
      throw new ConflictException('邮箱已被使用');
    }

    const user = await this.userModel.findByIdAndUpdate(
      userId,
      { $set: { username, email } },
      { new: true },
    );
    if (!user) throw new NotFoundException('用户不存在');
    return { user: await this.toAuthUser(user) };
  }

  async updatePaymentAccount(userId: string, dto: UpdatePaymentAccountDto) {
    const account = dto.payment_account.trim();
    if (!account) {
      throw new BadRequestException('收款账户不能为空');
    }
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('用户不存在');
    if (!user.company_id?.trim()) {
      throw new BadRequestException('请先完成公司与收款账户设置');
    }
    user.payment_account = account;
    await user.save();
    return {
      payment_account: user.payment_account,
      user: await this.toAuthUser(user),
    };
  }

  async updateProfileSetup(userId: string, dto: UpdateProfileSetupDto) {
    const company = await this.companyService.findByIdOrFail(
      dto.company_id.trim(),
    );
    const account = dto.payment_account.trim();
    if (!account) {
      throw new BadRequestException('收款账户不能为空');
    }
    const user = await this.userModel.findByIdAndUpdate(
      userId,
      {
        $set: {
          company_id: String(company._id),
          company_name: company.name,
          payment_account: account,
        },
      },
      { new: true },
    );
    if (!user) throw new NotFoundException('用户不存在');
    return {
      company_id: user.company_id,
      company_name: user.company_name,
      payment_account: user.payment_account,
      user: await this.toAuthUser(user),
    };
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

  private async getFeishuTenantToken(): Promise<string | null> {
    const appId = process.env.FEISHU_APP_ID;
    const appSecret = process.env.FEISHU_APP_SECRET;
    if (!appId || !appSecret) {
      console.error('飞书应用凭证缺失，无法获取 tenant_access_token');
      return null;
    }
    const res = await fetch(
      'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
      },
    );
    const data = (await res.json()) as {
      code: number;
      msg?: string;
      tenant_access_token?: string;
    };
    if (data.code !== 0) {
      console.error('获取飞书 tenant_access_token 失败:', {
        code: data.code,
        msg: data.msg,
      });
      return null;
    }
    return data.tenant_access_token ?? null;
  }

  private async findOpenIdByUserId(userId: string): Promise<string | undefined> {
    const feishuUser = await this.feishuUserModel
      .findOne({ uid: userId })
      .select('open_id')
      .lean();
    const openId = feishuUser?.open_id?.trim();
    return openId || undefined;
  }

  private async findEmployeeIdByFeishuOpenId(
    openId: string,
  ): Promise<string | undefined> {
    const feishuUser = await this.feishuUserModel.findOne({ open_id: openId });
    if (!feishuUser?.uid) return undefined;
    const employee = await this.employeeModel.findOne({ uid: feishuUser.uid });
    return employee ? String(employee._id) : undefined;
  }

  /**
   * 按飞书部门 leader open_id 解析本地员工 id。
   * 负责人尚未在本系统登录（无 feishu 映射/员工档案）时返回 undefined，
   * manager_id 留空，等其自行登录后再补写。
   */
  private async resolveManagerIdFromFeishuLeader(
    leaderOpenId: string | undefined,
  ): Promise<string | undefined> {
    if (!leaderOpenId) return undefined;
    return this.findEmployeeIdByFeishuOpenId(leaderOpenId);
  }

  /**
   * 当前登录用户建好员工档案后：若其 open_id 恰好是该部门飞书负责人，则补写 manager_id。
   */
  private async backfillManagerIfLoginUserIsLeader(params: {
    deptId: string;
    openId: string;
    openDepartmentId: string;
    tenantToken: string;
  }): Promise<void> {
    const { deptId, openId, openDepartmentId, tenantToken } = params;
    const info = await this.fetchFeishuDepartmentInfo(
      openDepartmentId,
      tenantToken,
    );
    if (!info?.leaderOpenId || info.leaderOpenId !== openId) return;

    const employeeId = await this.findEmployeeIdByFeishuOpenId(openId);
    if (!employeeId) return;

    const department = await this.deptModel.findById(deptId);
    if (!department) return;
    if (
      !shouldBackfillDepartmentManager({
        existingManagerId: department.manager_id,
        resolvedManagerEmployeeId: employeeId,
      })
    ) {
      return;
    }
    department.manager_id = employeeId;
    await department.save();
  }

  private async fetchFeishuDepartmentInfo(
    openDepartmentId: string,
    tenantToken: string,
  ): Promise<
    | {
        name: string;
        parentOpenDepartmentId: string | null;
        leaderOpenId?: string;
        sort: number;
      }
    | undefined
  > {
    const deptRes = await fetch(
      `https://open.feishu.cn/open-apis/contact/v3/departments/${openDepartmentId}?department_id_type=open_department_id&user_id_type=open_id`,
      { headers: { Authorization: `Bearer ${tenantToken}` } },
    );
    const deptData = (await deptRes.json()) as {
      code: number;
      msg?: string;
      data?: {
        department?: {
          name?: string;
          parent_department_id?: string;
          leader_user_id?: string;
          order?: string;
        };
      };
    };
    if (deptData.code !== 0) {
      console.error('获取飞书部门详情失败:', {
        openDepartmentId,
        code: deptData.code,
        msg: deptData.msg,
      });
      return undefined;
    }

    const department = deptData.data?.department;
    if (!department?.name) return undefined;

    const parentId = department.parent_department_id;
    return {
      name: department.name,
      parentOpenDepartmentId:
        !parentId || parentId === '0' ? null : parentId,
      leaderOpenId: department.leader_user_id,
      sort: Number(department.order) || 0,
    };
  }

  private async ensureLocalDepartmentFromFeishu(
    openDepartmentId: string,
    tenantToken: string,
    visiting = new Set<string>(),
  ): Promise<string | undefined> {
    if (visiting.has(openDepartmentId)) return undefined;
    visiting.add(openDepartmentId);

    const info = await this.fetchFeishuDepartmentInfo(openDepartmentId, tenantToken);
    if (!info) return undefined;

    let parentLocalId: string | null = null;
    if (info.parentOpenDepartmentId) {
      parentLocalId =
        (await this.ensureLocalDepartmentFromFeishu(
          info.parentOpenDepartmentId,
          tenantToken,
          visiting,
        )) ?? null;
    }

    let department = await this.deptModel.findOne({ name: info.name });
    const managerId = await this.resolveManagerIdFromFeishuLeader(
      info.leaderOpenId,
    );

    if (!department) {
      const deptCount = await this.deptModel.countDocuments();
      department = await this.deptModel.create({
        name: info.name,
        code: `DEPT${String(deptCount + 1).padStart(3, '0')}`,
        parent_id: parentLocalId,
        manager_id: managerId,
        status: 1,
        sort: info.sort,
      });
    } else if (
      shouldBackfillDepartmentManager({
        existingManagerId: department.manager_id,
        resolvedManagerEmployeeId: managerId,
      })
    ) {
      department.manager_id = managerId as string;
      await department.save();
    }

    return String(department._id);
  }

  private async fetchFeishuUserPrimaryDepartmentOpenId(
    openId: string,
    tenantToken: string,
  ): Promise<string | undefined> {
    const userDetailRes = await fetch(
      `https://open.feishu.cn/open-apis/contact/v3/users/${openId}?user_id_type=open_id`,
      { headers: { Authorization: `Bearer ${tenantToken}` } },
    );
    const userDetail = (await userDetailRes.json()) as {
      code: number;
      msg?: string;
      data?: { user?: { department_ids?: string[] } };
    };
    if (userDetail.code !== 0) {
      console.error('获取飞书用户部门失败:', {
        openId,
        code: userDetail.code,
        msg: userDetail.msg,
      });
      return undefined;
    }
    const departmentIds = userDetail.data?.user?.department_ids ?? [];
    if (departmentIds.length === 0) {
      console.warn('飞书用户无部门:', { openId });
      return undefined;
    }
    return departmentIds[0];
  }

  async syncFeishuDepartmentAndEmployee(params: {
    userId: string;
    openId: string;
    name: string;
    mobile: string;
    avatar_url: string;
  }): Promise<void> {
    const { userId, name, mobile, avatar_url } = params;
    const normalizedMobile = normalizePhone(mobile);
    const displayName = name || '飞书用户';

    // 已存在员工：uid → feishu_users.open_id；登录场景 params.openId 作为兜底
    const openId =
      (await this.findOpenIdByUserId(userId)) || params.openId?.trim() || '';
    if (!openId) {
      console.error('无法解析飞书 open_id，跳过部门同步:', { userId });
      return;
    }

    let deptId: string | undefined;
    let openDepartmentId: string | undefined;
    let tenantToken: string | null = null;
    try {
      tenantToken = await this.getFeishuTenantToken();
      if (!tenantToken) {
        console.error('无 tenant_access_token，跳过部门同步:', { userId, openId });
      } else {
        openDepartmentId = await this.fetchFeishuUserPrimaryDepartmentOpenId(
          openId,
          tenantToken,
        );
        if (openDepartmentId) {
          deptId = await this.ensureLocalDepartmentFromFeishu(
            openDepartmentId,
            tenantToken,
          );
        }
      }
    } catch (err) {
      console.error('获取飞书部门信息失败:', err);
    }

    // 仅按 uid 关联，避免同名员工互相覆盖
    const existingEmp = await this.employeeModel.findOne({ uid: userId });

    if (!existingEmp) {
      const empCount = await this.employeeModel.countDocuments();
      const employeeNo = `FE${String(empCount + 1).padStart(5, '0')}`;
      await this.employeeModel.create({
        employee_no: employeeNo,
        name: displayName,
        gender: 0,
        phone: normalizedMobile,
        avatar: avatar_url || '',
        status: 1,
        uid: userId,
        ...(deptId ? { dept_id: deptId } : {}),
      });
    } else {
      let dirty = false;
      if (normalizedMobile && existingEmp.phone !== normalizedMobile) {
        existingEmp.phone = normalizedMobile;
        dirty = true;
      }
      if (
        shouldAssignEmployeeDepartment({
          existingDeptId: existingEmp.dept_id,
          resolvedDeptId: deptId,
        })
      ) {
        existingEmp.dept_id = deptId as string;
        dirty = true;
      }
      if (dirty) {
        await existingEmp.save();
      }
    }

    if (deptId && tenantToken && openDepartmentId) {
      try {
        await this.backfillManagerIfLoginUserIsLeader({
          deptId,
          openId,
          openDepartmentId,
          tenantToken,
        });
      } catch (err) {
        console.error('补写部门负责人失败:', err);
      }
    }
  }

  async ensureUserFromFeishuOpenId(params: {
    openId: string;
    name?: string;
    email?: string;
    mobile?: string;
    avatar_url?: string;
    /** 为 false 时只建用户与飞书映射，不同步部门 */
    syncDepartment?: boolean;
  }): Promise<User> {
    const { openId, name, email, mobile, avatar_url, syncDepartment = true } =
      params;
    const normalizedMobile = normalizePhone(mobile);
    const feishuUser = await this.feishuUserModel.findOne({ open_id: openId });
    let user = feishuUser?.uid
      ? await this.userModel.findById(feishuUser.uid)
      : null;

    const normalizedEmail =
      email?.trim().toLowerCase() || `${openId}@feishu.local`;
    const defaultRoleId = await this.getDefaultEmployeeRoleId();

    if (!user && normalizedEmail) {
      user = await this.userModel.findOne({ email: normalizedEmail });
    }
    if (!user) {
      const generatedPassword = randomBytes(24).toString('hex');
      const username = `feishu_${openId}`;
      user = await this.userModel.create({
        username,
        password: generatedPassword,
        email: normalizedEmail,
        real_name: name || '飞书用户',
        phone: normalizedMobile,
        avatar: avatar_url || '',
        roles: [defaultRoleId],
        auth_provider: 'feishu',
        password_login_enabled: false,
      });
    } else if (normalizedMobile && user.phone !== normalizedMobile) {
      user.phone = normalizedMobile;
      await user.save();
    }

    await this.feishuUserModel.findOneAndUpdate(
      { open_id: openId },
      {
        open_id: openId,
        name: name || user.real_name,
        email: normalizedEmail,
        mobile: normalizedMobile,
        avatar_url,
        uid: String(user._id),
      },
      { upsert: true, returnDocument: 'after' },
    );

    if (syncDepartment) {
      try {
        await this.syncFeishuDepartmentAndEmployee({
          userId: String(user._id),
          openId,
          name: name || user.real_name,
          mobile: normalizedMobile,
          avatar_url: avatar_url || '',
        });
      } catch (err) {
        console.error('飞书部门/员工同步失败:', err);
      }
    }

    return user;
  }

  async feishuLogin(code: string): Promise<string> {
    const appId = process.env.FEISHU_APP_ID;
    const appSecret = process.env.FEISHU_APP_SECRET;
    const redirectUri = process.env.FEISHU_REDIRECT_URI;
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
          redirect_uri: redirectUri,
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
    const normalizedMobile = normalizePhone(mobile);
    const defaultRoleId = await this.getDefaultEmployeeRoleId();
    const normalizedEmail = email?.trim().toLowerCase() || `${open_id}@feishu.local`;

    // 3. 先通过映射表定位主用户
    const feishuUser = await this.feishuUserModel.findOne({ open_id: open_id });
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
        phone: normalizedMobile,
        avatar: avatar_url || '',
        roles: [defaultRoleId],
        auth_provider: 'feishu',
        password_login_enabled: false,
      });
    } else if (normalizedMobile && user.phone !== normalizedMobile) {
      user.phone = normalizedMobile;
      await user.save();
    }

    // 5. 维护飞书映射记录（仅身份映射与资料快照）
    await this.feishuUserModel.findOneAndUpdate(
      { open_id: open_id },
      {
        open_id: open_id,
        union_id: union_id,
        name,
        email: normalizedEmail,
        mobile: normalizedMobile,
        avatar_url,
        uid: String(user._id),
      },
      { upsert: true, returnDocument: 'after' },
    );

    // 6. 同步飞书部门与员工（新建或补写已有员工的 dept_id）
    try {
      await this.syncFeishuDepartmentAndEmployee({
        userId: String(user._id),
        openId: open_id,
        name: name || user.real_name,
        mobile: normalizedMobile,
        avatar_url,
      });
    } catch (err) {
      console.error('飞书部门/员工同步失败:', err);
    }

    // 7. 基于主用户签发 token
    return this.signAccessToken({
      id: String(user._id),
      username: user.username,
    });
  }

  async getSessionByToken(userId: string) {
    await this.reconcileApprovalRole(userId);
    const user = await this.userModel.findById(userId).populate({
      path: 'roles',
      populate: [{ path: 'permissions' }, { path: 'menus' }],
    });
    if (!user) throw new NotFoundException('用户不存在');

    const populatedRoles = user.roles as unknown as PopulatedRole[];
    const permissionMap = new Map<string, PopulatedPermission>();
    const menuMap = new Map<string, PopulatedMenu>();
    for (const role of populatedRoles) {
      for (const p of role.permissions) permissionMap.set(String(p._id), p);
      for (const m of role.menus) menuMap.set(String(m._id), m);
    }
    const permissions = [...permissionMap.values()].map((p) => p.name);
    const menus = this.buildMenuTree([...menuMap.values()]);
    const roles = populatedRoles.map((r) => r.name).filter(Boolean);
    const token = this.signAccessToken({
      id: String(user._id),
      username: user.username,
    });
    const refreshToken = this.signRefreshToken({
      id: String(user._id),
      username: user.username,
    });
    return {
      token,
      refreshToken,
      user: await this.toAuthUser(user),
      permissions,
      roles,
      menus,
    };
  }

  async refreshToken(dto: RefreshTokenDto) {
    let payload: { id: string; username: string; type?: string };
    try {
      payload = this.jwtService.verify(dto.refreshToken);
    } catch {
      throw new UnauthorizedException('refreshToken 无效或已过期');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('refreshToken 类型无效');
    }

    const user = await this.userModel.findById(payload.id).select(
      '_id username status',
    );
    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }
    if (user.status === 0) {
      throw new ForbiddenException('账号已被禁用');
    }

    // 刷新时重算权限与菜单，避免角色变更后 localStorage 旧会话长期不生效
    return this.getSessionByToken(String(user._id));
  }
}

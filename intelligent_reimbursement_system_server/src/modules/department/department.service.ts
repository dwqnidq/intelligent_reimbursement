import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Department } from '../../schemas/department.schema';
import { Employee } from '../../schemas/employee.schema';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

@Injectable()
export class DepartmentService {
  private readonly logger = new Logger(DepartmentService.name);
  private static readonly FEISHU_CACHE_TTL_MS = 5 * 60 * 1000;
  private feishuNamesCache: { names: string[]; expiresAt: number } | null =
    null;

  constructor(
    @InjectModel(Department.name)
    private deptModel: Model<Department>,
    @InjectModel(Employee.name)
    private empModel: Model<Employee>,
  ) {}

  async findAll(query?: { status?: number; tree?: boolean }) {
    const filter: Record<string, unknown> = {};
    if (query?.status !== undefined) filter.status = query.status;
    const departments = await this.deptModel
      .find(filter)
      .populate('manager_id', 'name avatar position')
      .populate('parent_id', 'name code')
      .sort({ sort: 1, createdAt: 1 });

    if (query?.tree) {
      return this.buildTree(departments);
    }
    return departments;
  }

  async findNameOptions(): Promise<string[]> {
    return this.fetchFeishuDepartmentNamesCached();
  }

  private async fetchFeishuDepartmentNamesCached(): Promise<string[]> {
    const now = Date.now();
    if (
      this.feishuNamesCache &&
      this.feishuNamesCache.expiresAt > now
    ) {
      return this.feishuNamesCache.names;
    }

    const names = await this.fetchFeishuDepartmentNames();
    this.feishuNamesCache = {
      names,
      expiresAt: now + DepartmentService.FEISHU_CACHE_TTL_MS,
    };
    return names;
  }

  private async getFeishuTenantToken(): Promise<string | null> {
    const appId = process.env.FEISHU_APP_ID;
    const appSecret = process.env.FEISHU_APP_SECRET;
    if (!appId || !appSecret) return null;
    try {
      const res = await fetch(
        'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
          signal: AbortSignal.timeout(3000),
        },
      );
      const data = (await res.json()) as {
        code: number;
        tenant_access_token?: string;
      };
      return data.code === 0 ? data.tenant_access_token ?? null : null;
    } catch {
      return null;
    }
  }

  private async fetchFeishuDepartmentChildren(
    parentId: string,
    tenantToken: string,
  ): Promise<
    Array<{
      name?: string;
      open_department_id?: string;
    }>
  > {
    const all: Array<{ name?: string; open_department_id?: string }> = [];
    let pageToken: string | undefined;

    do {
      const url = new URL(
        `https://open.feishu.cn/open-apis/contact/v3/departments/${parentId}/children`,
      );
      url.searchParams.set('department_id_type', 'open_department_id');
      url.searchParams.set('page_size', '50');
      if (pageToken) url.searchParams.set('page_token', pageToken);

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${tenantToken}` },
        signal: AbortSignal.timeout(5000),
      });
      const data = (await res.json()) as {
        code: number;
        data?: {
          items?: Array<{
            name?: string;
            open_department_id?: string;
          }>;
          page_token?: string;
          has_more?: boolean;
        };
      };
      if (data.code !== 0) break;
      all.push(...(data.data?.items ?? []));
      pageToken =
        data.data?.has_more && data.data?.page_token
          ? data.data.page_token
          : undefined;
    } while (pageToken);

    return all;
  }

  private async fetchFeishuDepartmentNames(): Promise<string[]> {
    const tenantToken = await this.getFeishuTenantToken();
    if (!tenantToken) return [];

    const names = new Set<string>();
    let queue = ['0'];

    while (queue.length > 0) {
      const levelIds = queue;
      queue = [];
      const batches = await Promise.all(
        levelIds.map((parentId) =>
          this.fetchFeishuDepartmentChildren(parentId, tenantToken).catch(
            () => [],
          ),
        ),
      );
      for (const items of batches) {
        for (const dept of items) {
          const name = String(dept.name ?? '').trim();
          if (name) names.add(name);
          const childId = dept.open_department_id;
          if (childId) queue.push(childId);
        }
      }
    }

    return [...names].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  }

  async create(dto: CreateDepartmentDto) {
    if (dto.parent_id) {
      await this.assertParentExists(dto.parent_id);
    }

    const exists = await this.deptModel.findOne({
      $or: [{ name: dto.name }, { code: dto.code }],
    });
    if (exists) {
      if (exists.name === dto.name) throw new ConflictException('部门名称已存在');
      throw new ConflictException('部门编码已存在');
    }

    const doc = await this.deptModel.create({
      ...dto,
      parent_id: dto.parent_id ?? null,
    });
    return { id: doc._id };
  }

  async update(id: string, dto: UpdateDepartmentDto) {
    const record = await this.deptModel.findById(id);
    if (!record) throw new NotFoundException('部门不存在');

    if (dto.parent_id !== undefined) {
      if (dto.parent_id === id) {
        throw new BadRequestException('上级部门不能是自己');
      }
      if (dto.parent_id) {
        await this.assertParentExists(dto.parent_id);
        if (await this.isDescendant(id, dto.parent_id)) {
          throw new BadRequestException('上级部门不能是当前部门的子部门');
        }
      }
    }

    if (dto.name || dto.code) {
      const query: Record<string, unknown> = { _id: { $ne: id } };
      const or: Record<string, unknown>[] = [];
      if (dto.name) or.push({ name: dto.name });
      if (dto.code) or.push({ code: dto.code });
      if (or.length) {
        query.$or = or;
        const exists = await this.deptModel.findOne(query);
        if (exists) {
          if (exists.name === dto.name) throw new ConflictException('部门名称已存在');
          throw new ConflictException('部门编码已存在');
        }
      }
    }

    Object.assign(record, {
      ...dto,
      ...(dto.parent_id !== undefined
        ? { parent_id: dto.parent_id || null }
        : {}),
    });
    await record.save();
    return { id: record._id };
  }

  async remove(id: string) {
    const record = await this.deptModel.findById(id);
    if (!record) throw new NotFoundException('部门不存在');

    const childCount = await this.deptModel.countDocuments({ parent_id: id });
    if (childCount > 0) {
      throw new BadRequestException('该部门下有子部门，请先删除或移走子部门');
    }

    const employeeCount = await this.empModel.countDocuments({ dept_id: id });
    if (employeeCount > 0) {
      throw new BadRequestException('该部门下还有员工，请先调整员工所属部门');
    }

    await this.deptModel.deleteOne({ _id: id });
    return { id };
  }

  private async assertParentExists(parentId: string) {
    const parent = await this.deptModel.findById(parentId);
    if (!parent) throw new NotFoundException('上级部门不存在');
  }

  private async isDescendant(ancestorId: string, targetId: string): Promise<boolean> {
    const children = await this.deptModel.find({ parent_id: ancestorId }).select('_id');
    for (const child of children) {
      const childId = String(child._id);
      if (childId === targetId) return true;
      if (await this.isDescendant(childId, targetId)) return true;
    }
    return false;
  }

  private buildTree(departments: Department[], parentId: string | null = null) {
    return departments
      .filter((d) => String(d.parent_id ?? null) === String(parentId ?? null))
      .map((d) => ({
        ...d.toObject(),
        children: this.buildTree(departments, String(d._id)),
      }));
  }
}

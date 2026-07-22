import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as ExcelJS from 'exceljs';
import { Reimbursement } from '../../schemas/reimbursement_records.schema';
import { ReimbursementType } from '../../schemas/reimbursement_type.schema';
import { User } from '../../schemas/user.schema';
import { Employee } from '../../schemas/employee.schema';
import { Department } from '../../schemas/department.schema';
import { InvoiceInfo } from '../../schemas/invoice_info.schema';
import { CreateReimbursementDto } from './dto/create-reimbursement.dto';
import { ApproveReimbursementDto } from './dto/approve-reimbursement.dto';
import { SearchReimbursementDto } from './dto/search-reimbursement.dto';
import { ApprovalRecordService } from '../approval-record/approval-record.service';
import {
  processAttachmentFile,
  calcAttachmentRowHeight,
  ATTACHMENT_COL_WIDTH,
  type AttachmentFileInfo,
  type EmbeddableImage,
} from './export-attachment.util';
import { putExportJob } from './export-job.store';
import { canAccessReimbursementDetail } from './reimbursement-access.util';

export interface ExportProgressPayload {
  percent: number;
  message: string;
  current?: number;
  total?: number;
}

interface PopulatedCategory {
  label?: string;
  fields?: {
    key: string;
    label: string;
    sort: number;
    is_calculate: boolean;
  }[];
  formula?: string;
  _id?: string;
}

interface PopulatedUser {
  _id?: string;
  real_name?: string;
}

interface PopulatedFile {
  url?: string;
}

interface ReimbursementDoc {
  _id: string;
  submission_batch_id: string;
  detail: Record<string, unknown>;
  category: PopulatedCategory | null;
  category_name?: string;
  applicant: PopulatedUser | null;
  approver: PopulatedUser | null;
  attachments: PopulatedFile[];
  is_over_limit: boolean;
  has_approval_flow?: boolean;
  amount: number;
  status: string;
  apply_date: string;
  calculated_amount?: number | null;
  applicant_name?: string | null;
}

interface FilterQuery {
  applicant?: string | { $in: string[] };
  category?: string | Record<string, unknown>;
  status?: string | Record<string, unknown>;
  amount?: { $gte?: number; $lte?: number };
  apply_date?: { $gte?: string; $lte?: string };
  department_name?: string | Record<string, unknown>;
  $and?: Record<string, unknown>[];
  [key: string]: unknown;
}

interface ReimbursementTreeGroup {
  key: string;
  _id: string;
  is_group: true;
  submission_batch_id: string;
  applicant_name: string | null;
  apply_date: string | null;
  total_amount: number;
  count: number;
  status: 'pending' | 'approved' | 'rejected' | 'mixed';
  children: ReimbursementDoc[];
}

interface PopulatedRoleForScope {
  name: string;
  permissions?: { name: string }[];
}

@Injectable()
export class ReimbursementService implements OnModuleInit {
  constructor(
    @InjectModel(Reimbursement.name)
    private reimbursementModel: Model<Reimbursement>,
    @InjectModel(ReimbursementType.name)
    private typeModel: Model<ReimbursementType>,
    @InjectModel(User.name)
    private userModel: Model<User>,
    @InjectModel(Employee.name)
    private employeeModel: Model<Employee>,
    @InjectModel(Department.name)
    private departmentModel: Model<Department>,
    @InjectModel(InvoiceInfo.name)
    private invoiceInfoModel: Model<InvoiceInfo>,
    private approvalRecordService: ApprovalRecordService,
  ) {}

  async onModuleInit() {
    await this.invoiceInfoModel.syncIndexes();
  }

  /** 与前端 canApprove（reimbursement:approve）一致：可查看全部报销并筛选 */
  private async resolveListScope(
    userId: string,
  ): Promise<{ canViewAll: boolean }> {
    const user = await this.userModel.findById(userId).populate({
      path: 'roles',
      populate: { path: 'permissions', select: 'name' },
    });
    const roles = (user?.roles ?? []) as unknown as PopulatedRoleForScope[];
    const canViewAll = roles.some((role) => {
      if (role.name === 'admin') return true;
      return (role.permissions ?? []).some(
        (p) => p.name === 'reimbursement:approve',
      );
    });
    return { canViewAll };
  }

  private toValidObjectIds(ids: string[]): Types.ObjectId[] {
    return ids
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
  }

  private resolveInvoiceNumber(dto: CreateReimbursementDto): string {
    return (
      dto.invoice_info?.invoice_number?.trim() ||
      dto.invoice_number?.trim() ||
      ''
    );
  }

  private async assertInvoiceNumberAvailable(invoiceNumber: string) {
    const normalized = invoiceNumber.trim();
    if (!normalized) return;

    const inInvoiceInfos = await this.invoiceInfoModel
      .findOne({ invoice_number: normalized })
      .select('_id')
      .lean();
    if (inInvoiceInfos) {
      throw new BadRequestException(
        `该发票已上传，发票号码「${normalized}」不可重复提交`,
      );
    }

    const legacyDup = await this.reimbursementModel
      .findOne({
        invoice_number: normalized,
        status: { $in: ['pending', 'approved'] },
      })
      .select('_id status')
      .lean();
    if (legacyDup) {
      throw new BadRequestException(
        `该发票已上传，发票号码「${normalized}」不可重复提交`,
      );
    }
  }

  async isInvoiceNumberAvailable(invoiceNumber: string) {
    const normalized = invoiceNumber.trim();
    if (!normalized) {
      return { available: true, invoice_number: '' };
    }

    const inInvoiceInfos = await this.invoiceInfoModel
      .findOne({ invoice_number: normalized })
      .select('_id')
      .lean();
    if (inInvoiceInfos) {
      return {
        available: false,
        invoice_number: normalized,
        message: `该发票已上传，发票号码「${normalized}」不可重复提交`,
      };
    }

    const legacyDup = await this.reimbursementModel
      .findOne({
        invoice_number: normalized,
        status: { $in: ['pending', 'approved'] },
      })
      .select('_id status')
      .lean();
    return {
      available: !legacyDup,
      invoice_number: normalized,
      message: legacyDup
        ? `该发票已上传，发票号码「${normalized}」不可重复提交`
        : undefined,
    };
  }

  /**
   * 请求体为数组：每一项为一次「报销包」（含 applicant_name、category、attachments、apply_date、details[]）。
   * 每个包内 details 的每一条写入一条数据库记录。
   */
  async createBatch(userId: string, dtos: CreateReimbursementDto[]) {
    if (!Array.isArray(dtos) || dtos.length === 0) {
      throw new BadRequestException('请求体须为包含至少一项的非空 JSON 数组');
    }

    // 同一次请求共用一个 submission_batch_id
    const submissionBatchId = new Types.ObjectId().toHexString();
    const invoiceNumbersInBatch = new Set<string>();
    const allIds: string[] = [];
    for (const dto of dtos) {
      const inv = this.resolveInvoiceNumber(dto);
      if (inv) {
        if (invoiceNumbersInBatch.has(inv)) {
          throw new BadRequestException(
            `同一次提交中发票号码「${inv}」重复，请合并为一条报销`,
          );
        }
        invoiceNumbersInBatch.add(inv);
      }
      const { ids } = await this.insertRecordsForSinglePayload(
        userId,
        dto,
        submissionBatchId,
      );
      allIds.push(...ids);
    }

    return { ids: allIds, count: allIds.length };
  }

  private async insertRecordsForSinglePayload(
    userId: string,
    dto: CreateReimbursementDto,
    submissionBatchId: string,
  ): Promise<{ ids: string[]; count: number }> {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('用户不存在');
    if (user.real_name !== dto.applicant_name) {
      throw new ForbiddenException('申请人姓名与账号不符');
    }

    const paymentAccount = (user.payment_account ?? '').trim();
    if (!paymentAccount) {
      throw new BadRequestException('请先在个人中心填写收款账户');
    }

    const companyId = (user.company_id ?? '').trim();
    const companyName = (user.company_name ?? '').trim();
    if (!companyId || !companyName) {
      throw new BadRequestException('请先在个人中心选择所属公司');
    }

    const departmentName = (dto.department_name ?? '').trim();
    if (!departmentName) {
      throw new BadRequestException('请选择部门');
    }

    const categoryType = await this.typeModel
      .findById(dto.category)
      .select('code label fields formula over_limit_threshold');
    if (!categoryType) throw new NotFoundException('报销类型不存在');

    const categoryForCalc = {
      label: categoryType.label,
      fields: categoryType.fields as unknown as {
        key: string;
        label: string;
        sort: number;
        is_calculate: boolean;
      }[],
      formula: categoryType.formula,
    };

    const overLimitThreshold = (
      categoryType as unknown as { over_limit_threshold?: number }
    ).over_limit_threshold;

    const attachmentIds = (dto.attachments || []).map((id) => String(id));
    const invoiceNumber = this.resolveInvoiceNumber(dto);
    if (invoiceNumber) {
      await this.assertInvoiceNumberAvailable(invoiceNumber);
    }

    const ids: string[] = [];
    let invoiceInfoCreated = false;
    for (const detail of dto.details) {
      const detailObj = detail as Record<string, unknown>;
      const calculatedAmount = this.calcAmount(categoryForCalc, detailObj);
      let amount = calculatedAmount ?? 0;
      const is_over_limit =
        overLimitThreshold != null ? amount > overLimitThreshold : false;
      if (is_over_limit && overLimitThreshold != null) {
        amount = overLimitThreshold;
      }

      const record = await this.reimbursementModel.create({
        submission_batch_id: submissionBatchId,
        applicant: userId,
        category: dto.category,
        category_name: categoryType.label,
        department_name: departmentName,
        payment_account: paymentAccount,
        company_id: companyId,
        company_name: companyName,
        invoice_number: invoiceNumber,
        amount,
        is_over_limit,
        detail: detailObj,
        attachments: attachmentIds,
        apply_date: dto.apply_date,
      });
      ids.push(String(record._id));

      if (invoiceNumber && !invoiceInfoCreated) {
        try {
          await this.invoiceInfoModel.create({
            invoice_number: invoiceNumber,
            invoice_title: (dto.invoice_info?.invoice_title ?? '').trim(),
            invoice_date: (dto.invoice_info?.invoice_date ?? '').trim(),
            issuer: (dto.invoice_info?.issuer ?? '').trim(),
            reimbursement_id: String(record._id),
            uploaded_by: userId,
          });
          invoiceInfoCreated = true;
        } catch (err: unknown) {
          const code = (err as { code?: number })?.code;
          if (code === 11000) {
            throw new BadRequestException(
              `该发票已上传，发票号码「${invoiceNumber}」不可重复提交`,
            );
          }
          throw err;
        }
      }

      // Trigger approval flow
      const typeCode = (categoryType as unknown as { code?: string }).code;
      if (typeCode) {
        const approvalRecord = await this.approvalRecordService.create(
          String(record._id),
          typeCode,
          amount,
        );
        if (approvalRecord) {
          await this.reimbursementModel.findByIdAndUpdate(record._id, {
            has_approval_flow: true,
          });
        }
      }
    }

    return {
      ids: ids.map((id) => String(id)),
      count: ids.length,
    };
  }

  async approve(userId: string, id: string, dto: ApproveReimbursementDto) {
    if (dto.status === 'rejected' && !dto.reject_reason) {
      throw new BadRequestException('驳回时必须填写原因');
    }

    const record = await this.reimbursementModel.findById(id);
    if (!record) throw new NotFoundException('报销单不存在');
    if (record.status !== 'pending') {
      throw new BadRequestException('该报销单已审批，不可重复操作');
    }
    if (record.has_approval_flow) {
      throw new BadRequestException(
        '该报销单已配置审批流程，请通过「待审批」或审批流节点操作',
      );
    }

    const { canViewAll } = await this.resolveListScope(userId);
    if (!canViewAll) {
      throw new ForbiddenException('无审批权限');
    }

    const now = new Date();
    const approvedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const updated = await this.reimbursementModel.findByIdAndUpdate(
      id,
      {
        $set: {
          status: dto.status,
          approver: userId,
          approved_at: approvedDate,
          reject_reason: dto.reject_reason || null,
        },
      },
      { returnDocument: 'after' },
    );
    return { id: updated!._id, status: updated!.status };
  }

  async withdraw(userId: string, id: string) {
    const user = await this.userModel.findById(userId).populate('roles');
    const roles = user!.roles as unknown as { name: string }[];
    const isAdmin = roles.some((r) => r.name === 'admin');

    const record = await this.reimbursementModel.findById(id);
    if (!record) throw new NotFoundException('报销单不存在');
    if (!isAdmin && String(record.applicant) !== String(userId)) {
      throw new ForbiddenException('只能撤回自己的报销单');
    }
    if (record.status === 'pending') {
      throw new BadRequestException('报销单已是待审批状态，无需撤回');
    }

    await this.reimbursementModel.findByIdAndUpdate(id, {
      $set: {
        status: 'pending',
        approver: null,
        approved_at: null,
        reject_reason: null,
      },
    });

    if (record.has_approval_flow) {
      await this.approvalRecordService.resetAndReopenAfterWithdraw(id);
    }

    return { id, status: 'pending' };
  }

  async getList(userId: string, query: SearchReimbursementDto) {
    const { canViewAll } = await this.resolveListScope(userId);

    const page = Math.max(1, query.page || 1);
    const size = Math.max(1, query.size || 10);
    const skip = (page - 1) * size;

    const filter = await this.buildFilter(userId, canViewAll, query);
    if (filter === null) return { list: [], total: 0, page, size };

    return this.queryList(filter, page, size, skip);
  }

  /** 单条详情：申请人、具备全局审批权限者、或审批流中的审批人可查看 */
  async getOne(userId: string, id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('报销单不存在');
    }

    const item = await this.reimbursementModel
      .findById(id)
      .select('-createdAt -updatedAt')
      .populate(this.populateOptions);
    if (!item) throw new NotFoundException('报销单不存在');

    const { canViewAll } = await this.resolveListScope(userId);
    const rawApplicant = item.applicant as unknown;
    const applicantId =
      rawApplicant &&
      typeof rawApplicant === 'object' &&
      '_id' in (rawApplicant as object)
        ? String((rawApplicant as { _id: unknown })._id)
        : rawApplicant
          ? String(rawApplicant)
          : null;

    const emp = await this.employeeModel
      .findOne({ uid: userId })
      .select('_id')
      .lean();
    const viewerEmployeeId = emp?._id ? String(emp._id) : null;

    const approval =
      await this.approvalRecordService.findByReimbursementId(id);
    const approverEmployeeIds =
      approval?.flow_snapshot?.nodes?.flatMap((node) =>
        (node.approvers ?? []).map((a) => String(a.approver_id)),
      ) ?? [];

    if (
      !canAccessReimbursementDetail({
        userId,
        canViewAll,
        applicantId,
        viewerEmployeeId,
        approverEmployeeIds,
      })
    ) {
      throw new ForbiddenException('无权查看该报销单');
    }

    return this.formatItem(item);
  }

  async getTreeList(userId: string, query: SearchReimbursementDto) {
    const { canViewAll } = await this.resolveListScope(userId);

    const page = Math.max(1, query.page || 1);
    const size = Math.max(1, query.size || 10);

    const filter = await this.buildFilter(userId, canViewAll, query);
    if (filter === null) return { list: [], total: 0, page, size };

    const allList = await this.queryAll(filter);
    const groupedMap = new Map<string, ReimbursementDoc[]>();
    for (const item of allList) {
      const batchId = item.submission_batch_id || item._id;
      const prev = groupedMap.get(batchId) ?? [];
      prev.push(item);
      groupedMap.set(batchId, prev);
    }

    const allGroups: ReimbursementTreeGroup[] = Array.from(
      groupedMap.entries(),
    ).map(([batchId, children]) => {
      const total_amount = children.reduce(
        (sum, x) => sum + (x.amount ?? 0),
        0,
      );
      const statusSet = new Set(children.map((x) => x.status));
      const status =
        statusSet.size === 1
          ? (Array.from(statusSet)[0] as 'pending' | 'approved' | 'rejected')
          : 'mixed';
      const first = children[0];
      return {
        key: `batch-${batchId}`,
        _id: `batch-${batchId}`,
        is_group: true,
        submission_batch_id: batchId,
        applicant_name: first?.applicant_name ?? null,
        apply_date: first?.apply_date ?? null,
        total_amount,
        count: children.length,
        status,
        children: children.map((child) => ({
          ...child,
          key: child._id,
        })) as ReimbursementDoc[],
      };
    });

    const total = allGroups.length;
    const start = (page - 1) * size;
    const list = allGroups.slice(start, start + size);

    return { list, total, page, size };
  }

  /** 展开部门 ID，包含所有子部门 */
  private async expandDepartmentIdsWithDescendants(
    selectedIds: string[],
  ): Promise<string[]> {
    const all = await this.departmentModel
      .find()
      .select('_id parent_id')
      .lean();
    const childrenMap = new Map<string, string[]>();
    for (const d of all) {
      const pid = d.parent_id ? String(d.parent_id) : '';
      if (!childrenMap.has(pid)) childrenMap.set(pid, []);
      childrenMap.get(pid)!.push(String(d._id));
    }
    const result = new Set<string>();
    const collect = (id: string) => {
      result.add(id);
      for (const child of childrenMap.get(id) ?? []) collect(child);
    };
    for (const id of selectedIds) collect(id);
    return Array.from(result);
  }

  private async resolveUserIdsFromEmployeeIds(
    employeeIds: string[],
  ): Promise<string[]> {
    if (employeeIds.length === 0) return [];
    const objectIds = this.toValidObjectIds(employeeIds);
    if (objectIds.length === 0) return [];
    const employees = await this.employeeModel
      .find({ _id: { $in: objectIds } })
      .select('uid name')
      .lean();
    const userIds = new Set<string>();
    const namesToMatch: string[] = [];
    for (const emp of employees) {
      // uid 可能为空、过期或与报销 applicant 不一致，必须同时按姓名回退匹配
      if (emp.uid) userIds.add(String(emp.uid));
      if (emp.name?.trim()) namesToMatch.push(emp.name.trim());
    }
    if (namesToMatch.length > 0) {
      const users = await this.userModel
        .find({ real_name: { $in: namesToMatch } })
        .select('_id')
        .lean();
      for (const u of users) userIds.add(String(u._id));
    }
    return Array.from(userIds);
  }

  private async resolveDepartmentFilter(
    departmentIds: string[],
  ): Promise<{ userIds: string[]; departmentNames: string[] }> {
    const expanded = await this.expandDepartmentIdsWithDescendants(departmentIds);
    if (expanded.length === 0) return { userIds: [], departmentNames: [] };
    const expandedObjectIds = this.toValidObjectIds(expanded);
    if (expandedObjectIds.length === 0) {
      return { userIds: [], departmentNames: [] };
    }

    const [employees, departments] = await Promise.all([
      this.employeeModel
        .find({ dept_id: { $in: expanded } })
        .select('uid')
        .lean(),
      this.departmentModel
        .find({ _id: { $in: expandedObjectIds } })
        .select('name')
        .lean(),
    ]);

    const userIds = new Set<string>();
    for (const emp of employees) {
      if (emp.uid) userIds.add(String(emp.uid));
    }

    const departmentNames = departments.map((d) => d.name).filter(Boolean);
    if (departmentNames.length > 0) {
      const users = await this.userModel
        .find({ department: { $in: departmentNames } })
        .select('_id')
        .lean();
      for (const u of users) userIds.add(String(u._id));
    }

    return { userIds: Array.from(userIds), departmentNames };
  }

  private async resolveApplicantConstraint(
    query: SearchReimbursementDto,
  ): Promise<Record<string, unknown> | null> {
    const employeeIds = (query.employee_ids ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const departmentIds = (query.department_ids ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (employeeIds.length === 0 && departmentIds.length === 0) {
      return null;
    }

    const constraints: Record<string, unknown>[] = [];

    if (employeeIds.length > 0) {
      const userIds = await this.resolveUserIdsFromEmployeeIds(employeeIds);
      if (userIds.length === 0) return { applicant: { $in: [] } };
      constraints.push({ applicant: { $in: userIds } });
    }

    if (departmentIds.length > 0) {
      const { userIds, departmentNames } =
        await this.resolveDepartmentFilter(departmentIds);
      const orClause: Record<string, unknown>[] = [];
      if (userIds.length > 0) orClause.push({ applicant: { $in: userIds } });
      if (departmentNames.length > 0) {
        orClause.push({ department_name: { $in: departmentNames } });
      }
      if (orClause.length === 0) return { applicant: { $in: [] } };
      constraints.push(
        orClause.length === 1 ? orClause[0] : { $or: orClause },
      );
    }

    if (constraints.length === 1) return constraints[0];
    return { $and: constraints };
  }

  /** 构建通用筛选条件，category 支持逗号分隔多值 */
  private async buildFilter(
    userId: string,
    canViewAll: boolean,
    query: SearchReimbursementDto,
  ): Promise<FilterQuery | null> {
    const {
      category,
      status,
      min_amount,
      max_amount,
      start_date,
      end_date,
    } = query;
    const filter: FilterQuery = !canViewAll ? { applicant: userId } : {};

    if (canViewAll) {
      const applicantConstraint = await this.resolveApplicantConstraint(query);
      if (applicantConstraint === null) {
        // no employee/department filter
      } else if (
        'applicant' in applicantConstraint &&
        Array.isArray(
          (applicantConstraint.applicant as { $in?: string[] })?.$in,
        ) &&
        (applicantConstraint.applicant as { $in: string[] }).$in.length === 0
      ) {
        return null;
      } else if ('$and' in applicantConstraint) {
        filter.$and = [
          ...(filter.$and ?? []),
          ...(applicantConstraint.$and as Record<string, unknown>[]),
        ];
      } else if ('$or' in applicantConstraint) {
        filter.$and = [...(filter.$and ?? []), applicantConstraint];
      } else {
        Object.assign(filter, applicantConstraint);
      }
    }

    if (category) {
      const tokens = category
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
      const resolved = await this.resolveTypeRefs(tokens);
      if (resolved.length === 0) return null;
      if (resolved.length === 1) {
        filter.category = resolved[0].id;
      } else {
        filter.category = {
          $in: resolved.map((t) => t.id),
        } as unknown as string;
      }
    }

    if (status) {
      const statuses = status
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (statuses.length === 1) {
        filter.status = statuses[0];
      } else if (statuses.length > 1) {
        filter.status = { $in: statuses };
      }
    } else {
      filter.status = { $ne: 'withdrawn' } as unknown as string;
    }
    if (min_amount != null || max_amount != null) {
      filter.amount = {};
      if (min_amount != null) filter.amount.$gte = Number(min_amount);
      if (max_amount != null) filter.amount.$lte = Number(max_amount);
    }
    if (start_date || end_date) {
      filter.apply_date = {};
      if (start_date) filter.apply_date.$gte = start_date;
      if (end_date) filter.apply_date.$lte = end_date;
    }

    return filter;
  }

  private calcAmount(
    categoryObj: PopulatedCategory | null,
    detail: Record<string, unknown>,
  ): number | null {
    const formula = categoryObj?.formula;
    const fields = categoryObj?.fields || [];
    if (!formula) return null;

    const calcFields = fields.filter((f) => f.is_calculate);
    if (!calcFields.length) return null;

    const keys = calcFields.map((f) => f.key);

    // Ensure all variables referenced in the formula are included as function parameters
    const formulaVars = formula.match(/\b[a-zA-Z_]\w*\b/g) || [];
    const builtinFns = new Set([
      'Math', 'parseInt', 'parseFloat', 'Number', 'abs', 'ceil', 'floor', 'round', 'max', 'min', 'pow', 'sqrt',
    ]);
    for (const v of formulaVars) {
      if (!builtinFns.has(v) && !/^\d+$/.test(v) && !keys.includes(v)) {
        keys.push(v);
      }
    }

    const fn = new Function(...keys, `return ${formula}`) as (
      ...args: number[]
    ) => number;
    const args = keys.map((k) => Number(detail?.[k] ?? 0));
    return fn(...args);
  }

  private formatItem(item: Reimbursement): ReimbursementDoc {
    const obj = item.toObject() as unknown as ReimbursementDoc;
    const category = obj.category;
    const fields = category?.fields || [];
    const calculatedAmount = this.calcAmount(category, obj.detail);

    const detail = fields
      .sort((a, b) => a.sort - b.sort)
      .map((f) => ({
        label: f.label,
        value: obj.detail?.[f.key] ?? null,
      }));

    return {
      ...obj,
      detail: detail as unknown as Record<string, unknown>,
      category: (obj.category_name ??
        category?.label ??
        null) as unknown as PopulatedCategory,
      applicant_name: (obj.applicant as PopulatedUser)?.real_name ?? null,
      applicant: ((obj.applicant as PopulatedUser)?._id ??
        null) as unknown as PopulatedUser,
      approver: ((obj.approver as PopulatedUser)?.real_name ??
        null) as unknown as PopulatedUser,
      attachments: (obj.attachments || []).map(
        (f) => f.url,
      ) as unknown as PopulatedFile[],
      calculated_amount: calculatedAmount,
    };
  }

  private get populateOptions() {
    return [
      { path: 'applicant', select: 'real_name' },
      { path: 'category', select: 'label fields formula -_id' },
      { path: 'approver', select: 'real_name' },
      { path: 'attachments', select: 'url -_id' },
    ];
  }

  private async queryAll(filter: FilterQuery) {
    const list = await this.reimbursementModel
      .find(filter)
      .select('-createdAt -updatedAt')
      .populate(this.populateOptions)
      .sort({ createdAt: -1 });

    return list.map((item) => this.formatItem(item));
  }

  private async queryList(
    filter: FilterQuery,
    page: number,
    size: number,
    skip: number,
  ) {
    const [list, total] = await Promise.all([
      this.reimbursementModel
        .find(filter)
        .select('-createdAt -updatedAt')
        .populate(this.populateOptions)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(size),
      this.reimbursementModel.countDocuments(filter),
    ]);

    return {
      list: list.map((item) => this.formatItem(item)),
      total,
      page,
      size,
    };
  }

  /** 对 export_fields 按依赖关系做拓扑排序，确保被依赖字段先计算 */
  private topoSort<T extends { key: string; calc_fields?: string[] }>(
    fields: T[],
  ): T[] {
    const exportKeySet = new Set(fields.map((f) => f.key));
    // 构建入度表和邻接表（只考虑 export_fields 内部的依赖）
    const inDegree = new Map<string, number>();
    const graph = new Map<string, string[]>(); // key -> 依赖它的字段 key 列表

    for (const f of fields) {
      if (!inDegree.has(f.key)) inDegree.set(f.key, 0);
      if (!graph.has(f.key)) graph.set(f.key, []);
    }

    for (const f of fields) {
      for (const dep of f.calc_fields ?? []) {
        if (exportKeySet.has(dep)) {
          // f 依赖 dep，dep 需要先计算
          graph.get(dep)!.push(f.key);
          inDegree.set(f.key, (inDegree.get(f.key) ?? 0) + 1);
        }
      }
    }

    // Kahn 算法
    const queue = fields.filter((f) => (inDegree.get(f.key) ?? 0) === 0);
    const sorted: T[] = [];

    while (queue.length > 0) {
      const node = queue.shift()!;
      sorted.push(node);
      for (const neighbor of graph.get(node.key) ?? []) {
        const deg = (inDegree.get(neighbor) ?? 1) - 1;
        inDegree.set(neighbor, deg);
        if (deg === 0) {
          const neighborField = fields.find((f) => f.key === neighbor);
          if (neighborField) queue.push(neighborField);
        }
      }
    }

    // 如果有环（理论上不应该），fallback 到原始顺序
    return sorted.length === fields.length ? sorted : fields;
  }

  /** Excel 工作表名：去掉非法字符并截断到 31 */
  private sanitizeSheetName(raw: string): string {
    const cleaned = raw
      .replace(/[*?:\\/[\]]/g, '_')
      .replace(/'/g, '')
      .trim();
    const base = cleaned || '工作表';
    return base.slice(0, 31);
  }

  /** 保证工作簿内 sheet 名唯一 */
  private allocateSheetName(raw: string, used: Set<string>): string {
    let name = this.sanitizeSheetName(raw);
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
    let index = 2;
    while (index < 1000) {
      const suffix = `(${index})`;
      const truncated = name.slice(0, Math.max(1, 31 - suffix.length)) + suffix;
      if (!used.has(truncated)) {
        used.add(truncated);
        return truncated;
      }
      index += 1;
    }
    const fallback = `工作表_${used.size + 1}`.slice(0, 31);
    used.add(fallback);
    return fallback;
  }

  private writeEmptySheetTip(sheet: ExcelJS.Worksheet, typeLabel?: string) {
    const title = typeLabel?.trim()
      ? `「${typeLabel.trim()}」导出说明`
      : '导出说明';
    const row1 = sheet.addRow([title]);
    const row2 = sheet.addRow([
      '当前筛选条件下没有匹配的报销记录。请检查报销类型、状态、员工、部门或日期等筛选条件。',
    ]);
    row1.getCell(1).font = { bold: true, size: 12 };
    row2.getCell(1).font = { size: 11, color: { argb: 'FF64748B' } };
    sheet.getColumn(1).width = 68;
  }

  /**
   * 解析导出/筛选中的报销类型 token（可为 _id / code / name）
   * 优先按 _id 命中，避免把「看起来像 ObjectId 的 code」误当主键。
   */
  private async resolveTypeRefs(
    tokens: string[],
  ): Promise<{ id: string; label: string }[]> {
    const result: { id: string; label: string }[] = [];
    const seen = new Set<string>();
    for (const token of tokens) {
      let doc:
        | { _id: unknown; label?: string; code?: string; name?: string }
        | null = null;
      if (/^[0-9a-fA-F]{24}$/.test(token)) {
        doc = await this.typeModel
          .findById(token)
          .select('label code name')
          .lean();
      }
      if (!doc) {
        doc = await this.typeModel
          .findOne({ $or: [{ code: token }, { name: token }] })
          .select('label code name')
          .lean();
      }
      if (!doc) continue;
      const id = String(doc._id);
      if (seen.has(id)) continue;
      seen.add(id);
      result.push({
        id,
        label: (doc.label || doc.name || doc.code || id).trim() || id,
      });
    }
    return result;
  }

  /** 无匹配记录时生成带说明文字的有效 xlsx（避免空工作簿损坏） */
  private async writeEmptyExportWorkbook(
    query: SearchReimbursementDto,
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = '智能报销系统';
    workbook.created = new Date();

    const tokens = (query.category ?? '')
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);

    const usedNames = new Set<string>();
    const sheetLabels: string[] = [];
    if (tokens.length > 0) {
      const types = await this.resolveTypeRefs(tokens);
      if (types.length > 0) {
        for (const t of types) sheetLabels.push(t.label);
      } else {
        for (const token of tokens) sheetLabels.push(token);
      }
    } else {
      sheetLabels.push('导出结果');
    }

    for (const label of sheetLabels) {
      const sheet = workbook.addWorksheet(
        this.allocateSheetName(label, usedNames),
      );
      this.writeEmptySheetTip(sheet, label);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async exportExcel(
    userId: string,
    query: SearchReimbursementDto,
    onProgress?: (payload: ExportProgressPayload) => void,
  ): Promise<Buffer> {
    const report = (percent: number, message: string, current?: number, total?: number) => {
      onProgress?.({ percent, message, current, total });
    };
    const { canViewAll } = await this.resolveListScope(userId);

    const filter = await this.buildFilter(userId, canViewAll, query);
    const effectiveFilter =
      filter ?? (!canViewAll ? { applicant: userId } : {});

    // 只 populate 申请人，category 单独查以获取 export_fields
    const rawList = await this.reimbursementModel
      .find(effectiveFilter)
      .populate({ path: 'applicant', select: 'real_name' })
      .populate({ path: 'attachments', select: 'url original_name mime_type' })
      .sort({ createdAt: -1 })
      .lean();

    report(5, '正在查询报销记录...');

    const selectedTokens = (query.category ?? '')
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    const selectedTypes = selectedTokens.length
      ? await this.resolveTypeRefs(selectedTokens)
      : [];

    if (rawList.length === 0 && selectedTypes.length === 0) {
      report(100, '没有可导出的报销记录');
      return this.writeEmptyExportWorkbook(query);
    }

    const totalAttachmentTasks = rawList.reduce((sum, item) => {
      const files =
        (item.attachments as unknown as AttachmentFileInfo[] | undefined) ?? [];
      return sum + files.length;
    }, 0);
    const progressAttachmentTotal = Math.max(
      totalAttachmentTasks,
      rawList.length,
      1,
    );
    let processedAttachmentTasks = 0;

    // 收集所有涉及的 category id（含所选但无数据的类型），批量查报销类型
    const categoryIds = [
      ...new Set([
        ...rawList.map((r) => String(r.category)),
        ...selectedTypes.map((t) => t.id),
      ]),
    ];
    const typeList = await this.typeModel
      .find({ _id: { $in: categoryIds } })
      .select('label fields export_fields formula')
      .lean();

    type FieldDef = {
      key: string;
      label: string;
      is_calculate: boolean;
      sort: number;
    };
    type ExportFieldDef = {
      key: string;
      label: string;
      is_calculate: boolean;
      sort: number;
      formula?: string;
      calc_fields?: string[];
      value?: number;
    };
    type TypeInfo = {
      label: string;
      fields: FieldDef[];
      export_fields: ExportFieldDef[];
      formula: string;
    };

    const typeMap = new Map<string, TypeInfo>();
    for (const t of typeList) {
      typeMap.set(String(t._id), {
        label: t.label,
        fields: (t.fields ?? []) as FieldDef[],
        export_fields: ((t.export_fields ?? []) as ExportFieldDef[]).sort(
          (a, b) => a.sort - b.sort,
        ),
        formula: t.formula ?? '',
      });
    }
    // 所选类型可能暂无记录，用解析出的 label 补齐
    for (const selected of selectedTypes) {
      if (!typeMap.has(selected.id)) {
        typeMap.set(selected.id, {
          label: selected.label,
          fields: [],
          export_fields: [],
          formula: '',
        });
      }
    }

    // 按报销类型分组
    const groups = new Map<
      string,
      { typeInfo: TypeInfo; rows: typeof rawList }
    >();
    for (const item of rawList) {
      const catId = String(item.category);
      const typeInfo = typeMap.get(catId) ?? {
        label: '未分类',
        fields: [],
        export_fields: [],
        formula: '',
      };
      if (!groups.has(catId)) {
        groups.set(catId, { typeInfo, rows: [] });
      }
      groups.get(catId)!.rows.push(item);
    }

    // 有明确勾选类型时：按勾选顺序导出；无数据的类型单独空表，不影响有数据的类型
    // 有数据的类型排在前面，避免 Excel 默认打开第一个空说明页造成误解
    const exportEntriesRaw: {
      catId: string;
      typeInfo: TypeInfo;
      rows: typeof rawList;
    }[] =
      selectedTypes.length > 0
        ? selectedTypes.map((t) => ({
            catId: t.id,
            typeInfo: typeMap.get(t.id) ?? {
              label: t.label,
              fields: [],
              export_fields: [],
              formula: '',
            },
            rows: groups.get(t.id)?.rows ?? [],
          }))
        : [...groups.entries()].map(([catId, group]) => ({
            catId,
            typeInfo: group.typeInfo,
            rows: group.rows,
          }));
    const exportEntries = [
      ...exportEntriesRaw.filter((e) => e.rows.length > 0),
      ...exportEntriesRaw.filter((e) => e.rows.length === 0),
    ];

    if (exportEntries.length === 0) {
      report(100, '没有可导出的报销记录');
      return this.writeEmptyExportWorkbook(query);
    }

    const workbook = new ExcelJS.Workbook();

    workbook.creator = '智能报销系统';

    workbook.created = new Date();

    const headerFill: ExcelJS.Fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFFF00' },
    };
    const headerFont: Partial<ExcelJS.Font> = { bold: true, size: 12 };
    const redBoldFont: Partial<ExcelJS.Font> = {
      bold: true,
      size: 12,
      color: { argb: 'FFFF0000' },
    };
    const thinBorder: Partial<ExcelJS.Borders> = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
    };
    const centerAlign: Partial<ExcelJS.Alignment> = {
      horizontal: 'center',
      vertical: 'middle',
    };

    const summaryData: { label: string; total: number }[] = [];
    const usedSheetNames = new Set<string>();

    for (const entry of exportEntries) {
      const { typeInfo, rows } = entry;
      const sheetName = this.allocateSheetName(typeInfo.label, usedSheetNames);
      const sheet = workbook.addWorksheet(sheetName);

      if (rows.length === 0) {
        this.writeEmptySheetTip(sheet, typeInfo.label);
        summaryData.push({ label: typeInfo.label, total: 0 });
        continue;
      }

      // 对 export_fields 做拓扑排序，保证被依赖的字段先计算
      const exportFields = this.topoSort(typeInfo.export_fields);

      // 列定义：序号 + 申请人 + 部门 + 动态列 + 总价 + 附件
      sheet.columns = [
        { header: '序号', key: '_index', width: 8 },
        { header: '申请人', key: '_applicant', width: 14 },
        { header: '部门', key: '_department', width: 16 },
        ...exportFields.map((f) => ({
          header: f.label,
          key: f.key,
          width: 16,
        })),
        { header: '总价', key: '_total', width: 14 },
        { header: '附件', key: '_attachments', width: ATTACHMENT_COL_WIDTH },
      ];

      // 表头样式（黄底加粗），总价列表头也标红
      const headerRow = sheet.getRow(1);
      const totalColIndex = exportFields.length + 4;
      const attachmentColIndex = exportFields.length + 5;
      headerRow.eachCell((cell, colNumber) => {
        cell.fill = headerFill;
        cell.font = colNumber === totalColIndex ? redBoldFont : headerFont;
        cell.alignment = centerAlign;
        cell.border = thinBorder;
      });
      headerRow.height = 22;

      let categoryTotal = 0;

      for (let idx = 0; idx < rows.length; idx++) {
        const item = rows[idx];
        const detail = (item.detail ?? {}) as Record<string, unknown>;
        const applicantName =
          (item.applicant as unknown as { real_name?: string })?.real_name ??
          '';
        const departmentName = (item.department_name as string) ?? '';
        const attachmentFiles = (
          (item.attachments as unknown as AttachmentFileInfo[]) ?? []
        ).filter((f) => Boolean(f?.url));
        const attachmentUrls = attachmentFiles.map((f) => f.url);

        report(
          10 +
            Math.floor(
              (processedAttachmentTasks / progressAttachmentTotal) * 75,
            ),
          `正在处理第 ${idx + 1}/${rows.length} 条记录的附件...`,
          processedAttachmentTasks,
          progressAttachmentTotal,
        );

        // 计算总价：从报销类型的 fields 中筛出 is_calculate=true，用 typeInfo.formula 计算
        let rowTotal = 0;
        if (typeInfo.formula) {
          const calcFields = typeInfo.fields.filter((f) => f.is_calculate);
          const calcParams: { key: string; value: number; label: string }[] =
            [];
          for (const f of calcFields) {
            calcParams.push({
              key: f.key,
              value: Number(detail[f.key] ?? 0),
              label: f.label,
            });
          }
          try {
            const paramKeys = calcParams.map((p) => p.key);
            const paramValues = calcParams.map((p) => p.value);

            const fn = new Function(
              ...paramKeys,
              `return ${typeInfo.formula}`,
            ) as (...args: number[]) => number;
            rowTotal = fn(...paramValues) ?? 0;
          } catch {
            rowTotal = 0;
          }
        }

        categoryTotal += rowTotal;

        const rowData: Record<string, unknown> = {
          _index: idx + 1,
          _applicant: applicantName,
          _department: departmentName,
          _total: rowTotal,
          _attachments: attachmentUrls.join('\n'),
        };

        // 过滤出有 formula 和 calc_fields 的导出字段（这些字段有 value 缓存）
        const calcExportFields = exportFields.filter(
          (f) => f.formula && f.calc_fields && f.calc_fields.length > 0,
        );

        // 填充动态列：有 formula + calc_fields 的字段先计算，否则取 detail 原值，再 fallback 到 calcExportFields 的 value
        for (const f of exportFields) {
          if (f.formula && f.calc_fields && f.calc_fields.length > 0) {
            const calcParams: { key: string; value: number }[] = [];
            for (const ck of f.calc_fields) {
              // detail 里没有则从 calcExportFields 的 value 取
              const detailVal = detail[ck];
              const cachedVal = calcExportFields.find(
                (ef) => ef.key === ck,
              )?.value;
              const val =
                detailVal !== undefined && detailVal !== null
                  ? Number(detailVal)
                  : Number(cachedVal ?? 0);
              calcParams.push({ key: ck, value: val });
            }
            try {
              const paramKeys = calcParams.map((p) => p.key);
              const paramValues = calcParams.map((p) => p.value);

              const fn = new Function(...paramKeys, `return ${f.formula}`) as (
                ...args: number[]
              ) => number;
              const calcResult = fn(...paramValues) ?? 0;
              rowData[f.key] = calcResult;
              // 将计算结果写回数据库 detail 字段
              await this.reimbursementModel.updateOne(
                { _id: item._id },
                { $set: { [`detail.${f.key}`]: calcResult } },
              );
            } catch {
              // 计算失败：先取 detail，再 fallback 到 calcExportFields 的 value
              const cached = calcExportFields.find((ef) => ef.key === f.key);
              rowData[f.key] =
                detail[f.key] !== undefined && detail[f.key] !== null
                  ? detail[f.key]
                  : (cached?.value ?? '');
            }
          } else {
            // 无计算逻辑：先取 detail，再 fallback 到 calcExportFields 的 value
            const cached = calcExportFields.find((ef) => ef.key === f.key);
            rowData[f.key] =
              detail[f.key] !== undefined && detail[f.key] !== null
                ? detail[f.key]
                : (cached?.value ?? '');
          }
        }

        const dataRow = sheet.addRow(rowData);

        const rowImages: EmbeddableImage[] = [];
        const rowHyperlinks: { url: string; label: string }[] = [];

        if (attachmentFiles.length === 0) {
          processedAttachmentTasks += 1;
        } else {
          for (const [fileIndex, file] of attachmentFiles.entries()) {
            const result = await processAttachmentFile(file);
            rowImages.push(...result.images);
            rowHyperlinks.push(...result.hyperlinks);
            processedAttachmentTasks += 1;
            report(
              10 +
                Math.floor(
                  (processedAttachmentTasks / progressAttachmentTotal) *
                    75,
                ),
              `正在下载附件 ${processedAttachmentTasks}/${progressAttachmentTotal}...`,
              processedAttachmentTasks,
              progressAttachmentTotal,
            );
            if (fileIndex < attachmentFiles.length - 1) {
              await new Promise((resolve) => setImmediate(resolve));
            }
          }
        }

        dataRow.eachCell((cell, colNumber) => {
          cell.alignment =
            colNumber === attachmentColIndex
              ? { vertical: 'middle', wrapText: true }
              : centerAlign;
          cell.border = thinBorder;
          if (colNumber === totalColIndex) {
            cell.font = redBoldFont;
          }
        });

        if (rowHyperlinks.length > 0) {
          const attachmentCell = dataRow.getCell(attachmentColIndex);
          if (rowHyperlinks.length === 1) {
            attachmentCell.value = {
              text: rowHyperlinks[0].label || '查看附件',
              hyperlink: rowHyperlinks[0].url,
            };
          } else {
            attachmentCell.value = {
              text: `查看附件(${rowHyperlinks.length})`,
              hyperlink: rowHyperlinks[0].url,
            };
          }
          attachmentCell.font = { color: { argb: 'FF0563C1' }, underline: true };
        } else if (rowImages.length > 0) {
          dataRow.getCell(attachmentColIndex).value = '';
        } else if (attachmentUrls.length > 0) {
          const attachmentCell = dataRow.getCell(attachmentColIndex);
          attachmentCell.value = {
            text: attachmentUrls.length === 1 ? '查看附件' : `查看附件(${attachmentUrls.length})`,
            hyperlink: attachmentUrls[0],
          };
          attachmentCell.font = { color: { argb: 'FF0563C1' }, underline: true };
        }

        const colIndex0 = attachmentColIndex - 1;
        const rowIndex0 = dataRow.number - 1;
        const imageSlotCount = Math.max(rowImages.length, 1);

        for (const [imageIndex, image] of rowImages.entries()) {
          const imageId = workbook.addImage({
            base64: image.buffer.toString('base64'),
            extension: image.extension,
          });
          const slotTop = rowIndex0 + imageIndex / imageSlotCount;
          const slotBottom = rowIndex0 + (imageIndex + 1) / imageSlotCount;
          sheet.addImage(imageId, {
            tl: { col: colIndex0, row: slotTop },
            br: { col: colIndex0 + 1, row: slotBottom },
            editAs: 'twoCell',
            hyperlinks: {
              hyperlink: image.sourceUrl,
              tooltip: image.tooltip ?? image.sourceUrl,
            },
          } as never);
        }

        dataRow.height = calcAttachmentRowHeight(
          rowImages.length,
          rowHyperlinks.length > 0,
        );
      }

      // 合计行
      const totalRow = sheet.addRow({ _index: '合计', _total: categoryTotal });
      totalRow.eachCell((cell) => {
        cell.font = redBoldFont;
        cell.alignment = centerAlign;
        cell.border = thinBorder;
      });
      totalRow.height = 22;

      summaryData.push({ label: typeInfo.label, total: categoryTotal });
    }

    // 多类型时追加汇总 sheet（仅统计有数据或用户显式选择的类型）
    if (exportEntries.length > 1) {
      const summarySheet = workbook.addWorksheet(
        this.allocateSheetName('汇总', usedSheetNames),
      );
      summarySheet.columns = [
        { header: '报销类型', key: 'label', width: 20 },
        { header: '合计金额', key: 'total', width: 16 },
      ];
      const sh = summarySheet.getRow(1);
      sh.eachCell((cell) => {
        cell.fill = headerFill;
        cell.font = headerFont;
        cell.alignment = centerAlign;
        cell.border = thinBorder;
      });
      sh.height = 22;

      let grandTotal = 0;
      for (const s of summaryData) {
        const row = summarySheet.addRow(s);
        row.eachCell((cell) => {
          cell.alignment = centerAlign;
          cell.border = thinBorder;
        });
        grandTotal += s.total;
      }
      const grandRow = summarySheet.addRow({
        label: '总计',
        total: grandTotal,
      });
      grandRow.eachCell((cell) => {
        cell.font = redBoldFont;
        cell.alignment = centerAlign;
        cell.border = thinBorder;
      });
    }

    report(90, '正在生成 Excel 文件...');
    const buffer = await workbook.xlsx.writeBuffer();
    report(100, '导出完成');
    return Buffer.from(buffer);
  }

  async exportExcelWithJob(
    userId: string,
    query: SearchReimbursementDto,
    onProgress: (payload: ExportProgressPayload) => void,
  ): Promise<{ token: string; filename: string }> {
    const buffer = await this.exportExcel(userId, query, onProgress);
    const filename = `reimbursements_${Date.now()}.xlsx`;
    const token = putExportJob(buffer, filename);
    return { token, filename };
  }
}

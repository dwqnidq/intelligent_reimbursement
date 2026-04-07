import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as ExcelJS from 'exceljs';
import { Reimbursement } from '../../schemas/reimbursement.schema';
import { ReimbursementType } from '../../schemas/reimbursement-type.schema';
import { User } from '../../schemas/user.schema';
import { CreateReimbursementDto } from './dto/create-reimbursement.dto';
import { ApproveReimbursementDto } from './dto/approve-reimbursement.dto';
import { SearchReimbursementDto } from './dto/search-reimbursement.dto';

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
  detail: Record<string, unknown>;
  category: PopulatedCategory | null;
  category_name?: string;
  applicant: PopulatedUser | null;
  approver: PopulatedUser | null;
  attachments: PopulatedFile[];
  is_over_limit: boolean;
  amount: number;
  status: string;
  apply_date: string;
  calculated_amount?: number | null;
  applicant_name?: string | null;
}

interface FilterQuery {
  applicant?: string | Types.ObjectId;
  category?: Types.ObjectId;
  status?: string;
  amount?: { $gte?: number; $lte?: number };
  apply_date?: { $gte?: string; $lte?: string };
  [key: string]: unknown;
}

@Injectable()
export class ReimbursementService {
  constructor(
    @InjectModel(Reimbursement.name)
    private reimbursementModel: Model<Reimbursement>,
    @InjectModel(ReimbursementType.name)
    private typeModel: Model<ReimbursementType>,
    @InjectModel(User.name)
    private userModel: Model<User>,
  ) {}

  async create(userId: string, dto: CreateReimbursementDto) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('用户不存在');
    if (user.real_name !== dto.applicant_name) {
      throw new ForbiddenException('申请人姓名与账号不符');
    }

    const categoryType = await this.typeModel
      .findById(dto.category)
      .select('label fields formula over_limit_threshold');
    if (!categoryType) throw new NotFoundException('报销类型不存在');

    // 后端根据 formula 和 fields 计算 amount，不依赖前端传值
    const calculatedAmount = this.calcAmount(
      {
        label: categoryType.label,
        fields: categoryType.fields as unknown as {
          key: string;
          label: string;
          sort: number;
          is_calculate: boolean;
        }[],
        formula: categoryType.formula,
      },
      dto.detail,
    );
    const amount = calculatedAmount ?? dto.amount ?? 0;

    const overLimitThreshold = (
      categoryType as unknown as { over_limit_threshold?: number }
    ).over_limit_threshold;
    const is_over_limit =
      overLimitThreshold != null ? amount > overLimitThreshold : false;

    const record = await this.reimbursementModel.create({
      applicant: new Types.ObjectId(userId),
      category: new Types.ObjectId(dto.category),
      category_name: categoryType.label,
      amount,
      is_over_limit,
      detail: dto.detail,
      attachments: (dto.attachments || []).map((id) => new Types.ObjectId(id)),
      apply_date: dto.apply_date,
    });

    return { id: record._id };
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
      { new: true },
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
    if (record.status !== 'pending') {
      throw new BadRequestException('只能撤回待审批状态的报销单');
    }

    await this.reimbursementModel.findByIdAndUpdate(id, {
      $set: { status: 'withdrawn' },
    });
    return { id, status: 'withdrawn' };
  }

  async getList(userId: string, query: SearchReimbursementDto) {
    const user = await this.userModel.findById(userId).populate('roles');
    const roles = user!.roles as unknown as { name: string }[];
    const isAdmin = roles.some((r) => r.name === 'admin');

    const page = Math.max(1, query.page || 1);
    const size = Math.max(1, query.size || 10);
    const skip = (page - 1) * size;

    const filter = await this.buildFilter(userId, isAdmin, query);
    if (filter === null) return { list: [], total: 0, page, size };

    return this.queryList(filter, page, size, skip);
  }

  /** 构建通用筛选条件，category 支持逗号分隔多值 */
  private async buildFilter(
    userId: string,
    isAdmin: boolean,
    query: SearchReimbursementDto,
  ): Promise<FilterQuery | null> {
    const { category, status, min_amount, max_amount, start_date, end_date } =
      query;
    const filter: FilterQuery = !isAdmin
      ? { applicant: new Types.ObjectId(userId) }
      : {};

    if (category) {
      const codes = category
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
      if (codes.length === 1) {
        const code = codes[0];
        if (Types.ObjectId.isValid(code)) {
          filter.category = new Types.ObjectId(code);
        } else {
          const type = await this.typeModel.findOne({ code }).select('_id');
          if (!type) return null;
          filter.category = new Types.ObjectId(String(type._id));
        }
      } else {
        // 多类型：全部解析为 ObjectId
        const ids: Types.ObjectId[] = [];
        for (const code of codes) {
          if (Types.ObjectId.isValid(code)) {
            ids.push(new Types.ObjectId(code));
          } else {
            const type = await this.typeModel.findOne({ code }).select('_id');
            if (type) ids.push(new Types.ObjectId(String(type._id)));
          }
        }
        if (ids.length === 0) return null;
        filter.category = { $in: ids } as unknown as Types.ObjectId;
      }
    }

    if (status) {
      filter.status = status;
    } else {
      // 默认不返回已撤回的记录
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
      .select('-createdAt -updatedAt -__v')
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
        .select('-createdAt -updatedAt -__v')
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

  async exportExcel(
    userId: string,
    query: SearchReimbursementDto,
  ): Promise<Buffer> {
    const user = await this.userModel.findById(userId).populate('roles');
    const roles = user!.roles as unknown as { name: string }[];
    const isAdmin = roles.some((r) => r.name === 'admin');

    const filter = await this.buildFilter(userId, isAdmin, query);
    const effectiveFilter =
      filter ?? (!isAdmin ? { applicant: new Types.ObjectId(userId) } : {});

    // 只 populate 申请人，category 单独查以获取 export_fields
    const rawList = await this.reimbursementModel
      .find(effectiveFilter)
      .populate({ path: 'applicant', select: 'real_name' })
      .sort({ createdAt: -1 })
      .lean();

    // 收集所有涉及的 category id，批量查报销类型
    const categoryIds = [...new Set(rawList.map((r) => String(r.category)))];
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

    for (const [, group] of groups) {
      const { typeInfo, rows } = group;

      // 对 export_fields 做拓扑排序，保证被依赖的字段先计算
      const exportFields = this.topoSort(typeInfo.export_fields);

      const sheet = workbook.addWorksheet(typeInfo.label.slice(0, 31));

      // 列定义：序号 + 申请人 + 动态列 + 总价

      sheet.columns = [
        { header: '序号', key: '_index', width: 8 },
        { header: '申请人', key: '_applicant', width: 14 },
        ...exportFields.map((f) => ({
          header: f.label,
          key: f.key,
          width: 16,
        })),
        { header: '总价', key: '_total', width: 14 },
      ];

      // 表头样式（黄底加粗），总价列表头也标红
      const headerRow = sheet.getRow(1);
      const totalColIndex = exportFields.length + 3; // 序号(1) + 申请人(2) + 动态列 + 总价
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
          _total: rowTotal,
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
        dataRow.eachCell((cell, colNumber) => {
          cell.alignment = centerAlign;
          cell.border = thinBorder;
          // 总价列数据标红
          if (colNumber === totalColIndex) {
            cell.font = redBoldFont;
          }
        });
        dataRow.height = 20;
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

    // 多类型时追加汇总 sheet
    if (groups.size > 1) {
      const summarySheet = workbook.addWorksheet('汇总');
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

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}

import type {
  ApprovalCardAttachment,
  ApprovalCardResolve,
  ApprovalDetailField,
  ApprovalReimbursementCardSummary,
} from '../feishu-bot/feishu-card.builder';

type LeanFile = {
  url?: string;
  original_name?: string;
};

type LeanApplicant = {
  _id?: { toString(): string };
  real_name?: string;
};

type TypeFieldDef = {
  key: string;
  label: string;
  sort?: number;
};

function formatDetailValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * 按报销类型 fields 把 detail(key→value) 转成 label/value 列表。
 * 无类型定义时退化为直接展示 detail 的 key。
 */
export function resolveApprovalDetailFields(
  detail: Record<string, unknown> | undefined,
  fields?: TypeFieldDef[],
): ApprovalDetailField[] {
  const raw = detail && typeof detail === 'object' ? detail : {};
  if (fields && fields.length > 0) {
    return [...fields]
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
      .map((f) => ({
        label: f.label || f.key,
        value: formatDetailValue(raw[f.key]),
      }))
      .filter((row) => row.value !== '');
  }
  return Object.entries(raw)
    .map(([key, value]) => ({
      label: key,
      value: formatDetailValue(value),
    }))
    .filter((row) => row.value !== '');
}

/** 报销单 lean 文档 → 飞书审批卡摘要（纯函数，便于单测） */
export function toApprovalCardSummary(
  doc: {
    category_name?: string;
    amount?: number;
    apply_date?: string;
    company_name?: string;
    payment_account?: string;
    detail?: Record<string, unknown>;
    attachments?: LeanFile[] | string[];
    applicant?: LeanApplicant | string;
    reject_reason?: string;
  },
  typeFields?: TypeFieldDef[],
): ApprovalReimbursementCardSummary & {
  applicantId?: string;
  reject_reason?: string;
} {
  const applicant =
    doc.applicant && typeof doc.applicant === 'object'
      ? doc.applicant
      : undefined;
  const attachments: ApprovalCardAttachment[] = [];
  for (const item of doc.attachments || []) {
    if (!item || typeof item === 'string') continue;
    if (!item.url) continue;
    attachments.push({
      name: item.original_name || '附件',
      url: item.url,
    });
  }

  return {
    applicantName: applicant?.real_name || '申请人',
    category: doc.category_name || '',
    amount: Number(doc.amount || 0),
    applyDate: doc.apply_date
      ? String(doc.apply_date).slice(0, 10)
      : undefined,
    companyName: doc.company_name?.trim() || undefined,
    paymentAccount: doc.payment_account?.trim() || undefined,
    detailFields: resolveApprovalDetailFields(doc.detail, typeFields),
    attachments,
    applicantId: applicant?._id?.toString(),
    reject_reason: doc.reject_reason || '',
  };
}

export type { ApprovalCardResolve };

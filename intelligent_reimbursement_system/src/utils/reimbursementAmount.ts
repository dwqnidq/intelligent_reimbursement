import type { ReimbursementRecord } from "../api/reimbursement";

/** 从记录中取金额：优先 amount 字段，其次 detail 中「总价」 */
export function getRecordAmount(r: ReimbursementRecord): number {
  if (typeof r.amount === "number" && !Number.isNaN(r.amount)) {
    return r.amount;
  }
  const item = r.detail?.find((d) => d.label === "总价");
  return item ? Number(item.value) || 0 : 0;
}

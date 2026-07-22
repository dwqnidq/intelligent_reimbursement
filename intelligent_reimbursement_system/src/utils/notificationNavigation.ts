export type NotificationNavSource = {
  payload?: Record<string, unknown>;
};

/** 从站内通知 payload 取出报销单 ID */
export function getReimbursementIdFromNotification(
  item: NotificationNavSource,
): string | null {
  const raw = item.payload?.reimbursement_id;
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  return id || null;
}

/** 报销记录页深链：列表 path + ?id= */
export function buildReimbursementDetailPath(
  listPath: string,
  reimbursementId: string,
): string {
  const base = listPath.trim() || "/";
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}id=${encodeURIComponent(reimbursementId)}`;
}

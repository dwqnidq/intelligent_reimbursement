/** 列表刷新后，决定右侧详情面板应如何同步 */

export type DetailSyncDecision<T> =
  | { action: "clear" }
  | { action: "keep" }
  | { action: "select"; record: T };

type DetailSyncFields = {
  _id: string;
  status: string;
  reject_reason?: string | null;
  approver?: string | null;
  approved_at?: string | null;
};

export type DetailSyncOptions = {
  /** 为 false 时，当前详情不在列表中则保持（深链打开的非本页记录） */
  allowFallbackToFirst?: boolean;
};

function detailNeedsReselect(
  current: DetailSyncFields,
  refreshed: DetailSyncFields,
): boolean {
  return (
    refreshed.status !== current.status ||
    refreshed.reject_reason !== current.reject_reason ||
    refreshed.approver !== current.approver ||
    refreshed.approved_at !== current.approved_at
  );
}

/**
 * 撤回 / 通过 / 驳回后左侧列表会刷新；若当前详情仍在列表中，
 * 必须用最新记录重选，否则右侧顶栏仍显示旧状态背景色。
 */
export function pickDetailAfterListRefresh<T extends DetailSyncFields>(
  detailItem: T | null,
  displayRecords: T[],
  options?: DetailSyncOptions,
): DetailSyncDecision<T> {
  const allowFallbackToFirst = options?.allowFallbackToFirst !== false;

  if (displayRecords.length === 0) {
    return allowFallbackToFirst ? { action: "clear" } : { action: "keep" };
  }
  if (detailItem) {
    const updated = displayRecords.find((r) => r._id === detailItem._id);
    if (updated) {
      if (detailNeedsReselect(detailItem, updated)) {
        return { action: "select", record: updated };
      }
      return { action: "keep" };
    }
    if (!allowFallbackToFirst) {
      return { action: "keep" };
    }
  } else if (!allowFallbackToFirst) {
    return { action: "keep" };
  }
  return { action: "select", record: displayRecords[0] };
}

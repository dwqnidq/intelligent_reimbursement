/** 审批流审批人须为启用部门负责人 */

export type DepartmentManagerSource = {
  status?: number;
  manager_id?: unknown;
};

function resolveManagerId(raw: unknown): string | undefined {
  if (raw == null || raw === '') return undefined;
  if (typeof raw === 'object' && raw !== null && '_id' in raw) {
    const id = String((raw as { _id: unknown })._id ?? '').trim();
    return id || undefined;
  }
  const id = String(raw).trim();
  if (!id || id === 'undefined' || id === 'null') return undefined;
  return id;
}

/** 从启用部门（status=1 或未标 status）收集负责人员工 ID */
export function collectEnabledDepartmentManagerIds(
  departments: DepartmentManagerSource[],
): Set<string> {
  const ids = new Set<string>();
  for (const dept of departments) {
    if (dept.status !== undefined && dept.status !== 1) continue;
    const managerId = resolveManagerId(dept.manager_id);
    if (managerId) ids.add(managerId);
  }
  return ids;
}

/** 返回不在负责人集合中的审批人 ID（去重，保序） */
export function findNonManagerApproverIds(
  approverIds: string[],
  managerIds: Set<string>,
): string[] {
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const raw of approverIds) {
    const id = String(raw ?? '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (!managerIds.has(id)) invalid.push(id);
  }
  return invalid;
}

/** 是否需要把解析到的部门 id 写到员工档案 */
export function shouldAssignEmployeeDepartment(input: {
  existingDeptId?: string | null;
  resolvedDeptId?: string | null;
}): boolean {
  const resolved = (input.resolvedDeptId ?? '').trim();
  if (!resolved) return false;
  const existing = (input.existingDeptId ?? '').trim();
  return !existing || existing !== resolved;
}

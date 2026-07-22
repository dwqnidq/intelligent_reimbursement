/** 会话用户部门名：优先员工档案关联部门，否则回退用户表 department */
export function resolveAuthUserDepartment(input: {
  employeeDepartmentName?: string | null;
  userDepartment?: string | null;
}): string {
  const fromEmployee = (input.employeeDepartmentName ?? '').trim();
  if (fromEmployee) return fromEmployee;
  return (input.userDepartment ?? '').trim();
}

/** 是否允许查看报销单详情（申请人 / 全局审批权限 / 审批流中的审批人） */
export function canAccessReimbursementDetail(input: {
  userId: string;
  canViewAll: boolean;
  applicantId: string | null | undefined;
  viewerEmployeeId: string | null | undefined;
  approverEmployeeIds: string[];
}): boolean {
  if (input.canViewAll) return true;
  if (input.applicantId && String(input.applicantId) === String(input.userId)) {
    return true;
  }
  const empId = input.viewerEmployeeId ? String(input.viewerEmployeeId) : '';
  if (!empId) return false;
  return input.approverEmployeeIds.some((id) => String(id) === empId);
}

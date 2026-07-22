export type ApprovalRoleChange = 'add' | 'remove' | 'none';

export function decideApprovalRoleChange(params: {
  isManager: boolean;
  hasApprovalRole: boolean;
}): ApprovalRoleChange {
  const { isManager, hasApprovalRole } = params;
  if (isManager && !hasApprovalRole) return 'add';
  if (!isManager && hasApprovalRole) return 'remove';
  return 'none';
}

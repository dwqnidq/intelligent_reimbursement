import { decideApprovalRoleChange } from './decide-approval-role-change.util';

describe('decideApprovalRoleChange', () => {
  it('负责人且无审批员角色时添加', () => {
    expect(
      decideApprovalRoleChange({ isManager: true, hasApprovalRole: false }),
    ).toBe('add');
  });

  it('负责人且已有审批员角色时不变', () => {
    expect(
      decideApprovalRoleChange({ isManager: true, hasApprovalRole: true }),
    ).toBe('none');
  });

  it('非负责人且有审批员角色时移除', () => {
    expect(
      decideApprovalRoleChange({ isManager: false, hasApprovalRole: true }),
    ).toBe('remove');
  });

  it('非负责人且无审批员角色时不变', () => {
    expect(
      decideApprovalRoleChange({ isManager: false, hasApprovalRole: false }),
    ).toBe('none');
  });
});

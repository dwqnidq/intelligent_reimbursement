import {
  collectEnabledDepartmentManagerIds,
  findNonManagerApproverIds,
} from './department-manager-approver.util';

describe('collectEnabledDepartmentManagerIds', () => {
  it('仅收集启用部门的负责人，并去重', () => {
    const ids = collectEnabledDepartmentManagerIds([
      { status: 1, manager_id: 'm1' },
      { status: 1, manager_id: { _id: 'm2' } },
      { status: 0, manager_id: 'disabled-mgr' },
      { status: 1, manager_id: 'm1' },
      { status: 1, manager_id: null },
      { status: 1 },
    ]);
    expect([...ids].sort()).toEqual(['m1', 'm2']);
  });
});

describe('findNonManagerApproverIds', () => {
  it('返回不在负责人集合中的审批人（去重）', () => {
    const invalid = findNonManagerApproverIds(
      ['m1', 'emp', 'm1', 'other'],
      new Set(['m1', 'm2']),
    );
    expect(invalid).toEqual(['emp', 'other']);
  });

  it('全部为负责人时返回空数组', () => {
    expect(
      findNonManagerApproverIds(['m1', 'm2'], new Set(['m1', 'm2'])),
    ).toEqual([]);
  });
});

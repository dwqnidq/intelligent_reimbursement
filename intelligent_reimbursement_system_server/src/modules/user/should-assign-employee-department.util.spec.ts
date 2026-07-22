import { shouldAssignEmployeeDepartment } from './should-assign-employee-department.util';

describe('shouldAssignEmployeeDepartment', () => {
  it('无解析结果时不赋值', () => {
    expect(
      shouldAssignEmployeeDepartment({
        existingDeptId: '',
        resolvedDeptId: '',
      }),
    ).toBe(false);
  });

  it('员工无部门且解析到部门时需要赋值', () => {
    expect(
      shouldAssignEmployeeDepartment({
        existingDeptId: null,
        resolvedDeptId: 'dept1',
      }),
    ).toBe(true);
  });

  it('已有相同部门时不重复写', () => {
    expect(
      shouldAssignEmployeeDepartment({
        existingDeptId: 'dept1',
        resolvedDeptId: 'dept1',
      }),
    ).toBe(false);
  });

  it('已有部门但与飞书不一致时需要覆盖', () => {
    expect(
      shouldAssignEmployeeDepartment({
        existingDeptId: 'dept1',
        resolvedDeptId: 'dept2',
      }),
    ).toBe(true);
  });
});

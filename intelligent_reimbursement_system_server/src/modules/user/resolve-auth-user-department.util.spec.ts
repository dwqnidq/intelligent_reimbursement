import { resolveAuthUserDepartment } from './resolve-auth-user-department.util';

describe('resolveAuthUserDepartment', () => {
  it('优先使用员工档案部门名', () => {
    expect(
      resolveAuthUserDepartment({
        employeeDepartmentName: '研发部',
        userDepartment: '市场部',
      }),
    ).toBe('研发部');
  });

  it('员工无部门时回退用户表 department', () => {
    expect(
      resolveAuthUserDepartment({
        employeeDepartmentName: '',
        userDepartment: '市场部',
      }),
    ).toBe('市场部');
  });

  it('两边都空时返回空字符串', () => {
    expect(
      resolveAuthUserDepartment({
        employeeDepartmentName: null,
        userDepartment: undefined,
      }),
    ).toBe('');
  });

  it('会 trim 空白', () => {
    expect(
      resolveAuthUserDepartment({
        employeeDepartmentName: '  行政部  ',
        userDepartment: '市场部',
      }),
    ).toBe('行政部');
  });
});

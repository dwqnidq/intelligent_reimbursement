import {
  parseFeishuContactUserResponse,
  shouldBackfillDepartmentManager,
} from './feishu-department-manager.util';

describe('parseFeishuContactUserResponse', () => {
  it('returns undefined when feishu api code is not 0', () => {
    expect(
      parseFeishuContactUserResponse('ou_1', { code: 99991663, data: {} }),
    ).toBeUndefined();
  });

  it('returns undefined when user payload is missing', () => {
    expect(
      parseFeishuContactUserResponse('ou_1', { code: 0, data: {} }),
    ).toBeUndefined();
  });

  it('parses name/email/mobile and prefers avatar_url', () => {
    expect(
      parseFeishuContactUserResponse('ou_leader', {
        code: 0,
        data: {
          user: {
            name: '张三',
            email: 'zhangsan@example.com',
            mobile: '+8613800138000',
            avatar_url: 'https://cdn/a.png',
            avatar: { avatar_origin: 'https://cdn/origin.png' },
          },
        },
      }),
    ).toEqual({
      open_id: 'ou_leader',
      name: '张三',
      email: 'zhangsan@example.com',
      mobile: '+8613800138000',
      avatar_url: 'https://cdn/a.png',
    });
  });

  it('falls back to avatar.avatar_origin when avatar_url is absent', () => {
    expect(
      parseFeishuContactUserResponse('ou_2', {
        code: 0,
        data: {
          user: {
            name: '李四',
            avatar: { avatar_origin: 'https://cdn/origin.png' },
          },
        },
      }),
    ).toEqual({
      open_id: 'ou_2',
      name: '李四',
      email: undefined,
      mobile: undefined,
      avatar_url: 'https://cdn/origin.png',
    });
  });
});

describe('shouldBackfillDepartmentManager', () => {
  it('backfills only when local manager is empty and resolved id exists', () => {
    expect(
      shouldBackfillDepartmentManager({
        existingManagerId: null,
        resolvedManagerEmployeeId: 'emp_1',
      }),
    ).toBe(true);
    expect(
      shouldBackfillDepartmentManager({
        existingManagerId: '',
        resolvedManagerEmployeeId: 'emp_1',
      }),
    ).toBe(true);
  });

  it('does not overwrite an already set manager', () => {
    expect(
      shouldBackfillDepartmentManager({
        existingManagerId: 'emp_old',
        resolvedManagerEmployeeId: 'emp_new',
      }),
    ).toBe(false);
  });

  it('does not backfill when resolved manager is missing', () => {
    expect(
      shouldBackfillDepartmentManager({
        existingManagerId: null,
        resolvedManagerEmployeeId: undefined,
      }),
    ).toBe(false);
  });
});

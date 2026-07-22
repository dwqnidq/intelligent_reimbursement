import { UserService } from './user.service';

describe('UserService.reconcileApprovalRole', () => {
  const APPROVAL_ROLE_ID = 'role-approval';
  const USER_ID = 'user-1';
  const EMP_ID = 'emp-1';

  function buildService(mocks: {
    roleFindOne?: jest.Mock;
    employeeFindOne?: jest.Mock;
    deptExists?: jest.Mock;
    userFindById?: jest.Mock;
    userUpdateOne?: jest.Mock;
  }) {
    const userModel = {
      findById: mocks.userFindById ?? jest.fn(),
      updateOne: mocks.userUpdateOne ?? jest.fn().mockResolvedValue({}),
    };
    const roleModel = {
      findOne: mocks.roleFindOne ?? jest.fn(),
    };
    const employeeModel = {
      findOne: mocks.employeeFindOne ?? jest.fn(),
    };
    const deptModel = {
      exists: mocks.deptExists ?? jest.fn(),
    };
    const service = new UserService(
      userModel as never,
      {} as never,
      roleModel as never,
      employeeModel as never,
      deptModel as never,
      {} as never,
      {} as never,
    );
    return { service, userModel, roleModel, employeeModel, deptModel };
  }

  async function reconcile(service: UserService) {
    return (
      service as unknown as {
        reconcileApprovalRole: (id: string) => Promise<void>;
      }
    ).reconcileApprovalRole(USER_ID);
  }

  it('启用部门负责人且无角色时 $addToSet', async () => {
    const userUpdateOne = jest.fn().mockResolvedValue({});
    const { service } = buildService({
      roleFindOne: jest.fn().mockReturnValue({
        select: () => ({
          lean: () => Promise.resolve({ _id: APPROVAL_ROLE_ID }),
        }),
      }),
      employeeFindOne: jest.fn().mockReturnValue({
        select: () => ({ lean: () => Promise.resolve({ _id: EMP_ID }) }),
      }),
      deptExists: jest.fn().mockResolvedValue({ _id: 'dept-1' }),
      userFindById: jest.fn().mockReturnValue({
        select: () => ({
          lean: () => Promise.resolve({ roles: ['role-employee'] }),
        }),
      }),
      userUpdateOne,
    });

    await reconcile(service);

    expect(userUpdateOne).toHaveBeenCalledWith(
      { _id: USER_ID },
      { $addToSet: { roles: APPROVAL_ROLE_ID } },
    );
  });

  it('非负责人且有角色时 $pull', async () => {
    const userUpdateOne = jest.fn().mockResolvedValue({});
    const { service } = buildService({
      roleFindOne: jest.fn().mockReturnValue({
        select: () => ({
          lean: () => Promise.resolve({ _id: APPROVAL_ROLE_ID }),
        }),
      }),
      employeeFindOne: jest.fn().mockReturnValue({
        select: () => ({ lean: () => Promise.resolve({ _id: EMP_ID }) }),
      }),
      deptExists: jest.fn().mockResolvedValue(null),
      userFindById: jest.fn().mockReturnValue({
        select: () => ({
          lean: () =>
            Promise.resolve({ roles: [APPROVAL_ROLE_ID, 'role-employee'] }),
        }),
      }),
      userUpdateOne,
    });

    await reconcile(service);

    expect(userUpdateOne).toHaveBeenCalledWith(
      { _id: USER_ID },
      { $pull: { roles: APPROVAL_ROLE_ID } },
    );
  });

  it('状态一致时不更新', async () => {
    const userUpdateOne = jest.fn().mockResolvedValue({});
    const { service } = buildService({
      roleFindOne: jest.fn().mockReturnValue({
        select: () => ({
          lean: () => Promise.resolve({ _id: APPROVAL_ROLE_ID }),
        }),
      }),
      employeeFindOne: jest.fn().mockReturnValue({
        select: () => ({ lean: () => Promise.resolve({ _id: EMP_ID }) }),
      }),
      deptExists: jest.fn().mockResolvedValue({ _id: 'dept-1' }),
      userFindById: jest.fn().mockReturnValue({
        select: () => ({
          lean: () => Promise.resolve({ roles: [APPROVAL_ROLE_ID] }),
        }),
      }),
      userUpdateOne,
    });

    await reconcile(service);

    expect(userUpdateOne).not.toHaveBeenCalled();
  });

  it('approval 角色缺失时不更新且不抛错', async () => {
    const userUpdateOne = jest.fn().mockResolvedValue({});
    const { service } = buildService({
      roleFindOne: jest.fn().mockReturnValue({
        select: () => ({ lean: () => Promise.resolve(null) }),
      }),
      userUpdateOne,
    });

    await expect(reconcile(service)).resolves.toBeUndefined();
    expect(userUpdateOne).not.toHaveBeenCalled();
  });

  it('查询异常时不抛错', async () => {
    const { service } = buildService({
      roleFindOne: jest.fn().mockReturnValue({
        select: () => ({
          lean: () => Promise.reject(new Error('db down')),
        }),
      }),
    });

    await expect(reconcile(service)).resolves.toBeUndefined();
  });
});

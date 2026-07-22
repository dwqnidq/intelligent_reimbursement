import { BadRequestException } from '@nestjs/common';
import { ReimbursementService } from './reimbursement.service';

describe('ReimbursementService.withdraw with approval flow', () => {
  function buildService(overrides?: {
    record?: Record<string, unknown> | null;
    resetAndReopen?: jest.Mock;
  }) {
    const record = overrides?.record ?? {
      _id: 'r1',
      status: 'approved',
      applicant: 'u1',
      has_approval_flow: true,
    };
    const reimbursementModel = {
      findById: jest.fn().mockResolvedValue(record),
      findByIdAndUpdate: jest.fn().mockResolvedValue(record),
    };
    const userModel = {
      findById: jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue({
          roles: [{ name: 'admin' }],
        }),
      }),
    };
    const resetAndReopenAfterWithdraw =
      overrides?.resetAndReopen ?? jest.fn().mockResolvedValue({ _id: 'ar-1' });
    const approvalRecordService = { resetAndReopenAfterWithdraw };

    const service = new ReimbursementService(
      reimbursementModel as never,
      {} as never,
      userModel as never,
      {} as never,
      {} as never,
      {} as never,
      approvalRecordService as never,
    );
    return { service, reimbursementModel, resetAndReopenAfterWithdraw };
  }

  it('resets reimbursement and reopens approval when has_approval_flow', async () => {
    const { service, reimbursementModel, resetAndReopenAfterWithdraw } =
      buildService();
    const result = await service.withdraw('u1', 'r1');
    expect(result).toEqual({ id: 'r1', status: 'pending' });
    expect(reimbursementModel.findByIdAndUpdate).toHaveBeenCalledWith(
      'r1',
      expect.objectContaining({
        $set: expect.objectContaining({ status: 'pending' }),
      }),
    );
    expect(resetAndReopenAfterWithdraw).toHaveBeenCalledWith('r1');
  });

  it('does not reopen when no approval flow', async () => {
    const { service, resetAndReopenAfterWithdraw } = buildService({
      record: {
        _id: 'r1',
        status: 'approved',
        applicant: 'u1',
        has_approval_flow: false,
      },
    });
    await service.withdraw('u1', 'r1');
    expect(resetAndReopenAfterWithdraw).not.toHaveBeenCalled();
  });

  it('rejects when already pending', async () => {
    const { service } = buildService({
      record: {
        _id: 'r1',
        status: 'pending',
        applicant: 'u1',
        has_approval_flow: true,
      },
    });
    await expect(service.withdraw('u1', 'r1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

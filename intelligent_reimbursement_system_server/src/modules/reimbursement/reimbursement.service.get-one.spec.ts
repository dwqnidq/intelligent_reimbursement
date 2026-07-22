import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ReimbursementService } from './reimbursement.service';

describe('ReimbursementService.getOne', () => {
  const validId = new Types.ObjectId().toString();

  function buildService(overrides?: {
    findByIdExec?: jest.Mock;
    resolveListScope?: jest.Mock;
    empFindOne?: jest.Mock;
    findByReimbursementId?: jest.Mock;
  }) {
    const chain = {
      select: jest.fn().mockReturnThis(),
      populate: jest.fn().mockResolvedValue(
        overrides?.findByIdExec
          ? undefined
          : {
              applicant: { _id: 'u1' },
              toObject: () => ({
                _id: validId,
                applicant: { _id: 'u1', real_name: '张三' },
                category: { label: '差旅', fields: [] },
                category_name: '差旅',
                attachments: [],
                detail: {},
                amount: 10,
                status: 'pending',
              }),
            },
      ),
    };
    if (overrides?.findByIdExec) {
      chain.populate = overrides.findByIdExec;
    }

    const reimbursementModel = {
      findById: jest.fn().mockReturnValue(chain),
    };
    const userModel = {
      findById: jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue({
          roles: [{ name: 'user', permissions: [] }],
        }),
      }),
    };
    const employeeModel = {
      findOne: overrides?.empFindOne ?? jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(null),
        }),
      }),
    };
    const approvalRecordService = {
      findByReimbursementId:
        overrides?.findByReimbursementId ??
        jest.fn().mockResolvedValue(null),
    };

    const service = new ReimbursementService(
      reimbursementModel as never,
      {} as never,
      userModel as never,
      employeeModel as never,
      {} as never,
      { syncIndexes: jest.fn() } as never,
      approvalRecordService as never,
    );

    if (overrides?.resolveListScope) {
      (
        service as unknown as {
          resolveListScope: typeof overrides.resolveListScope;
        }
      ).resolveListScope = overrides.resolveListScope;
    }

    return { service, reimbursementModel };
  }

  it('throws NotFound for invalid id', async () => {
    const { service } = buildService();
    await expect(service.getOne('u1', 'bad-id')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws Forbidden when viewer is unrelated', async () => {
    const { service } = buildService({
      resolveListScope: jest.fn().mockResolvedValue({ canViewAll: false }),
    });
    await expect(service.getOne('u2', validId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('returns formatted item for applicant', async () => {
    const { service } = buildService({
      resolveListScope: jest.fn().mockResolvedValue({ canViewAll: false }),
    });
    const result = await service.getOne('u1', validId);
    expect(result).toMatchObject({
      amount: 10,
      category: '差旅',
      applicant_name: '张三',
    });
  });
});

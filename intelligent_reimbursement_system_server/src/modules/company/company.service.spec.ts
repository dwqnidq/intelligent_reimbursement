import { ConflictException, BadRequestException } from '@nestjs/common';
import { CompanyService } from './company.service';

describe('CompanyService.create', () => {
  function buildService(overrides?: {
    findOne?: jest.Mock;
    create?: jest.Mock;
  }) {
    const companyModel = {
      findOne: overrides?.findOne ?? jest.fn().mockResolvedValue(null),
      create:
        overrides?.create ??
        jest.fn().mockResolvedValue({ _id: { toString: () => 'new-id' } }),
    };
    const userModel = {};
    return new CompanyService(
      companyModel as never,
      userModel as never,
    );
  }

  it('allows create without admin check and returns string id', async () => {
    const create = jest.fn().mockResolvedValue({
      _id: { toString: () => 'cid-1' },
    });
    const service = buildService({ create });

    const result = await service.create('any-user', { name: '  测试公司  ' });

    expect(create).toHaveBeenCalledWith({ name: '测试公司' });
    expect(result).toEqual({ id: 'cid-1' });
  });

  it('rejects empty name', async () => {
    const service = buildService();
    await expect(service.create('u1', { name: '   ' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects duplicate name', async () => {
    const service = buildService({
      findOne: jest.fn().mockResolvedValue({ _id: 'exists' }),
    });
    await expect(
      service.create('u1', { name: '已有公司' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

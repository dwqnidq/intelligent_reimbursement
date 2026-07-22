import { FeishuBotService } from './feishu-bot.service';

describe('FeishuBotService.handleApprovalCardAction reject reason', () => {
  function buildService(overrides?: {
    reject?: jest.Mock;
    findFeishuUser?: jest.Mock;
  }) {
    const reject =
      overrides?.reject ??
      jest.fn().mockResolvedValue({
        meta: { approvedByName: '李四', resolveKind: 'rejected' },
      });
    const findFeishuUser =
      overrides?.findFeishuUser ??
      jest.fn().mockResolvedValue({ uid: 'user-1' });

    const service = Object.create(
      FeishuBotService.prototype,
    ) as FeishuBotService;
    Object.assign(service, {
      logger: { warn: jest.fn(), log: jest.fn() },
      feishuUserModel: { findOne: findFeishuUser },
      approvalRecordService: { reject, approve: jest.fn() },
      approvalNotify: {
        buildResolvedCardForRecord: jest.fn().mockResolvedValue({
          card: { schema: '2.0' },
        }),
      },
    });
    return { service, reject, findFeishuUser };
  }

  it('rejects without calling service when reason is empty', async () => {
    const { service, reject } = buildService();
    const result = await service.handleApprovalCardAction({
      event: {
        open_id: 'ou-1',
        action: {
          value: {
            action: 'approval_reject',
            approval_record_id: 'ar-1',
          },
          form_value: { reject_reason: '  ' },
        },
      },
    });

    expect(result).toEqual({
      ok: false,
      toastContent: '请填写驳回原因',
    });
    expect(reject).not.toHaveBeenCalled();
  });

  it('passes trimmed reason as comment when rejecting', async () => {
    const { service, reject } = buildService();
    const result = await service.handleApprovalCardAction({
      event: {
        open_id: 'ou-1',
        action: {
          value: {
            action: 'approval_reject',
            approval_record_id: 'ar-1',
          },
          form_value: { reject_reason: '  发票模糊  ' },
        },
      },
    });

    expect(reject).toHaveBeenCalledWith('ar-1', 'user-1', '发票模糊');
    expect(result?.ok).toBe(true);
    expect(result?.toastContent).toBe('已驳回');
  });
});

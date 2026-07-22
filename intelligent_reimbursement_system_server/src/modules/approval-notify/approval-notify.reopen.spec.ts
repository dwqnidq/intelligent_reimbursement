import { ApprovalNotifyService } from './approval-notify.service';

describe('ApprovalNotifyService.reopenAfterWithdraw', () => {
  it('updates existing feishu cards, clears deliveries, then notifies node entered', async () => {
    const approvalRecordId = 'ar-99';
    const delivery = {
      idempotency_key: `feishu:ar:${approvalRecordId}:node:n1:emp:e1:pending`,
      feishu_message_id: 'om_1',
      status: 'sent',
      save: jest.fn().mockResolvedValue(undefined),
    };

    const approvalModel = {
      findById: jest.fn().mockResolvedValue({
        _id: approvalRecordId,
        status: 'pending',
        record_id: 'reimb-1',
        cur_node_idx: 0,
        flow_snapshot: {
          nodes: [
            {
              node_id: 'n1',
              approvers: [
                {
                  approver_id: 'e1',
                  name: '甲',
                  notify: true,
                  participation: 'pending',
                },
              ],
            },
          ],
        },
      }),
    };

    const reimbursementModel = {
      findById: jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({
          category_name: '差旅',
          amount: 10,
          apply_date: '2026-07-01',
          applicant: { real_name: '员工', _id: 'u-app' },
          attachments: [],
          detail: {},
          category: { fields: [], label: '差旅' },
        }),
      }),
    };

    const deliveryModel = {
      find: jest.fn().mockResolvedValue([delivery]),
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 1 }),
      exists: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    };

    const notificationService = {
      createIfAbsent: jest.fn().mockResolvedValue({}),
      deleteByIdempotencyKeyRegex: jest.fn().mockResolvedValue(1),
    };

    const feishuApi = {
      isEnabled: jest.fn().mockReturnValue(true),
      updateInteractiveCard: jest.fn().mockResolvedValue(undefined),
      sendInteractiveCardToOpenId: jest.fn().mockResolvedValue('om_new'),
    };

    const empModel = {
      findById: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ uid: 'u-approver' }),
      }),
    };
    const feishuUserModel = {
      findOne: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ open_id: 'ou_1' }),
      }),
    };

    const service = new ApprovalNotifyService(
      approvalModel as never,
      reimbursementModel as never,
      empModel as never,
      feishuUserModel as never,
      {} as never,
      deliveryModel as never,
      notificationService as never,
      feishuApi as never,
    );

    await service.reopenAfterWithdraw(approvalRecordId);

    expect(feishuApi.updateInteractiveCard).toHaveBeenCalledWith(
      'om_1',
      expect.anything(),
    );
    expect(deliveryModel.deleteMany).toHaveBeenCalled();
    expect(notificationService.deleteByIdempotencyKeyRegex).toHaveBeenCalled();
    expect(feishuApi.sendInteractiveCardToOpenId).toHaveBeenCalled();
    expect(notificationService.createIfAbsent).toHaveBeenCalled();
  });
});

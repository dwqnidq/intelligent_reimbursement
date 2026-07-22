import { ApprovalRecordService } from './approval-record.service';

describe('ApprovalRecordService.resetForReapproval', () => {
  it('returns null when no approval record', async () => {
    const recordModel = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    const service = new ApprovalRecordService(
      recordModel as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.resetForReapproval('reimb-x')).resolves.toBeNull();
  });

  it('resets status, cursor, actions, and strips transfer targets', async () => {
    const doc = {
      _id: 'ar-1',
      record_id: 'reimb-1',
      status: 'approved',
      cur_node_idx: 2,
      actions: [{ approver_name: '甲', action: 'approve' }],
      flow_snapshot: {
        nodes: [
          {
            node_id: 'n1',
            sign_type: 'orsign',
            approvers: [
              {
                approver_id: 'e1',
                name: '甲',
                participation: 'approved',
                notify: true,
                avatar: '',
                dept_name: '',
                position: '',
              },
              {
                approver_id: 'e2',
                name: '乙',
                participation: 'pending',
                notify: true,
                avatar: '',
                dept_name: '',
                position: '',
              },
            ],
            approved_by: ['甲'],
            transfers: { 甲: '乙' },
          },
        ],
      },
      save: jest.fn(async function save(this: typeof doc) {
        return this;
      }),
    };

    const recordModel = {
      findOne: jest.fn().mockResolvedValue(doc),
    };
    const service = new ApprovalRecordService(
      recordModel as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.resetForReapproval('reimb-1');
    expect(result).toBe(doc);
    expect(doc.status).toBe('pending');
    expect(doc.cur_node_idx).toBe(0);
    expect(doc.actions).toEqual([]);
    expect(doc.flow_snapshot.nodes[0].approvers.map((a) => a.name)).toEqual([
      '甲',
    ]);
    expect(doc.flow_snapshot.nodes[0].approvers[0].participation).toBe(
      'pending',
    );
    expect(doc.flow_snapshot.nodes[0].approved_by).toEqual([]);
    expect(doc.flow_snapshot.nodes[0].transfers).toEqual({});
    expect(doc.save).toHaveBeenCalled();
  });
});

describe('ApprovalRecordService.findMyHistory action-only', () => {
  it('skips records where user is listed but has no action', async () => {
    const empModel = {
      findOne: jest.fn().mockResolvedValue({ name: '甲', uid: 'u1' }),
    };
    const recordModel = {
      find: jest.fn().mockResolvedValue([
        {
          _id: 'ar-1',
          record_id: 'r1',
          status: 'approved',
          cur_node_idx: 1,
          actions: [],
          flow_snapshot: {
            nodes: [
              {
                node_id: 'n1',
                approvers: [{ name: '甲', approver_id: 'e1' }],
              },
            ],
          },
        },
      ]),
    };
    const reimbursementModel = {
      findById: jest.fn(),
    };

    const service = new ApprovalRecordService(
      recordModel as never,
      {} as never,
      empModel as never,
      {} as never,
      reimbursementModel as never,
      { findById: jest.fn() } as never,
    );

    const list = await service.findMyHistory('u1');
    expect(list).toEqual([]);
    expect(reimbursementModel.findById).not.toHaveBeenCalled();
  });

  it('returns records where user has an action', async () => {
    const empModel = {
      findOne: jest.fn().mockResolvedValue({ name: '甲', uid: 'u1' }),
    };
    const recordModel = {
      find: jest.fn().mockResolvedValue([
        {
          _id: 'ar-1',
          record_id: 'r1',
          status: 'approved',
          cur_node_idx: 1,
          actions: [
            {
              approver_name: '甲',
              action: 'approve',
              acted_at: new Date('2026-01-01'),
              comment: '',
            },
          ],
          flow_snapshot: {
            nodes: [
              {
                node_id: 'n1',
                approvers: [{ name: '甲', approver_id: 'e1' }],
              },
            ],
          },
        },
      ]),
    };
    const lean = jest.fn().mockResolvedValue({
      _id: 'r1',
      category_name: '差旅',
      amount: 100,
      apply_date: '2026-01-01',
      status: 'approved',
      is_over_limit: false,
      applicant: { real_name: '员工' },
    });
    const reimbursementModel = {
      findById: jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({ lean }),
        }),
      }),
    };

    const service = new ApprovalRecordService(
      recordModel as never,
      {} as never,
      empModel as never,
      {} as never,
      reimbursementModel as never,
      { findById: jest.fn() } as never,
    );

    const list = await service.findMyHistory('u1');
    expect(list).toHaveLength(1);
    expect((list[0] as { my_action: { action: string } }).my_action.action).toBe(
      'approve',
    );
  });
});

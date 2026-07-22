import { BadRequestException } from '@nestjs/common';
import { ApprovalRecordService } from './approval-record.service';

describe('ApprovalRecordService concurrent approve/reject', () => {
  const recordId = 'ar-1';
  const reimbursementId = 'reimb-1';
  const userId = 'user-1';

  type StoreRecord = {
    _id: string;
    record_id: string;
    status: string;
    cur_node_idx: number;
    actions: unknown[];
    flow_snapshot: {
      nodes: Array<{
        node_id: string;
        sign_type: string;
        approvers: Array<{
          approver_id: string;
          name: string;
          participation: string;
          notify?: boolean;
        }>;
        approved_by: string[];
      }>;
    };
  };

  function initialStore(): StoreRecord {
    return {
      _id: recordId,
      record_id: reimbursementId,
      status: 'pending',
      cur_node_idx: 0,
      actions: [],
      flow_snapshot: {
        nodes: [
          {
            node_id: 'n1',
            sign_type: 'orsign',
            approvers: [
              {
                approver_id: 'emp-1',
                name: '审批人甲',
                participation: 'pending',
                notify: true,
              },
            ],
            approved_by: [],
          },
        ],
      },
    };
  }

  /** 模拟 Mongo：读返回深拷贝，save 写回共享 store（无锁时并发会丢写） */
  function buildService() {
    const store = initialStore();
    const reimbursementUpdates: Array<{ status: string }> = [];

    const recordModel = {
      findById: jest.fn(async () => {
        await new Promise((r) => setTimeout(r, 10));
        const snapshot = structuredClone(store) as StoreRecord & {
          save: () => Promise<StoreRecord>;
        };
        snapshot.save = async () => {
          await new Promise((r) => setTimeout(r, 50));
          store.status = snapshot.status;
          store.cur_node_idx = snapshot.cur_node_idx;
          store.actions = structuredClone(snapshot.actions);
          store.flow_snapshot = structuredClone(snapshot.flow_snapshot);
          return store;
        };
        return snapshot;
      }),
    };
    const empModel = {
      findOne: jest.fn().mockResolvedValue({
        name: '审批人甲',
        uid: userId,
        _id: 'emp-1',
      }),
    };
    const reimbursementModel = {
      findByIdAndUpdate: jest.fn(
        async (_id: string, update: { status: string }) => {
          await new Promise((r) => setTimeout(r, 5));
          reimbursementUpdates.push({ status: update.status });
          return {};
        },
      ),
    };

    const service = new ApprovalRecordService(
      recordModel as never,
      {} as never,
      empModel as never,
      {} as never,
      reimbursementModel as never,
      {} as never,
      undefined,
    );

    return { service, store, reimbursementUpdates };
  }

  it('连点通过与驳回时，后到的操作失败且报销单只有一个终态', async () => {
    const { service, store, reimbursementUpdates } = buildService();

    const results = await Promise.allSettled([
      service.approve(recordId, userId),
      service.reject(recordId, userId),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      status: 'rejected',
      reason: expect.any(BadRequestException),
    });
    expect(reimbursementUpdates).toHaveLength(1);
    expect(['approved', 'rejected']).toContain(reimbursementUpdates[0].status);
    expect(store.status).toBe(reimbursementUpdates[0].status);
  });
});

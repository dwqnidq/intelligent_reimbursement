import {
  resetFlowSnapshotForReapproval,
  resetSnapshotNodeForReapproval,
  stripTransferAddedApprovers,
} from './approval-record-reset.util';

function approver(
  name: string,
  participation = 'pending',
): {
  approver_id: string;
  name: string;
  avatar: string;
  dept_name: string;
  position: string;
  notify: boolean;
  participation: string;
} {
  return {
    approver_id: `id-${name}`,
    name,
    avatar: '',
    dept_name: '',
    position: '',
    notify: true,
    participation,
  };
}

describe('stripTransferAddedApprovers', () => {
  it('removes chained transfer targets A→B→C', () => {
    const list = [approver('甲'), approver('乙'), approver('丙')];
    const transfers = { 甲: '乙', 乙: '丙' };
    const left = stripTransferAddedApprovers(list, transfers);
    expect(left.map((a) => a.name)).toEqual(['甲']);
  });

  it('keeps original peers when only one transferred', () => {
    const list = [approver('甲'), approver('丁'), approver('乙')];
    const left = stripTransferAddedApprovers(list, { 甲: '乙' });
    expect(left.map((a) => a.name)).toEqual(['甲', '丁']);
  });

  it('returns copy when no transfers', () => {
    const list = [approver('甲')];
    const left = stripTransferAddedApprovers(list, {});
    expect(left.map((a) => a.name)).toEqual(['甲']);
    expect(left).not.toBe(list);
  });
});

describe('resetSnapshotNodeForReapproval', () => {
  it('clears approvals, transfers, and resets participation', () => {
    const node = resetSnapshotNodeForReapproval({
      node_id: 'n1',
      sign_type: 'countersign',
      approvers: [
        approver('甲', 'approved'),
        approver('乙', 'pending'),
        approver('丙', 'skipped'),
      ],
      approved_by: ['甲'],
      transfers: { 甲: '乙', 乙: '丙' },
    });

    expect(node.approvers.map((a) => a.name)).toEqual(['甲']);
    expect(node.approvers[0].participation).toBe('pending');
    expect(node.approved_by).toEqual([]);
    expect(node.transfers).toEqual({});
  });
});

describe('resetFlowSnapshotForReapproval', () => {
  it('resets every node without mutating input', () => {
    const original = {
      nodes: [
        {
          node_id: 'n1',
          sign_type: 'orsign' as const,
          approvers: [approver('甲', 'approved'), approver('乙', 'skipped')],
          approved_by: ['甲'],
          transfers: {},
        },
        {
          node_id: 'n2',
          sign_type: 'countersign' as const,
          approvers: [approver('丙', 'approved'), approver('丁', 'pending')],
          approved_by: ['丙'],
          transfers: { 丙: '丁' },
        },
      ],
    };

    const reset = resetFlowSnapshotForReapproval(original);

    expect(original.nodes[0].approved_by).toEqual(['甲']);
    expect(reset.nodes[0].approved_by).toEqual([]);
    expect(reset.nodes[0].approvers.every((a) => a.participation === 'pending')).toBe(
      true,
    );
    expect(reset.nodes[1].approvers.map((a) => a.name)).toEqual(['丙']);
    expect(reset.nodes[1].transfers).toEqual({});
  });
});

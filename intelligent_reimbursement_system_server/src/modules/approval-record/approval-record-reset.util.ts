import type { ApproverInfo, FlowSnapshot, SnapshotNode } from '../../schemas/approval_record.schema';

type ApproverLike = Pick<
  ApproverInfo,
  'approver_id' | 'name' | 'avatar' | 'dept_name' | 'position' | 'notify' | 'participation'
>;

/** 从审批人列表中移除 transfers 的 values（转审加入的人，含链式转审） */
export function stripTransferAddedApprovers<T extends ApproverLike>(
  approvers: T[],
  transfers: Record<string, string> | undefined | null,
): T[] {
  const transferTargets = new Set(Object.values(transfers ?? {}));
  if (transferTargets.size === 0) return [...approvers];
  return approvers.filter((a) => !transferTargets.has(a.name));
}

/** 单节点重置：清转审加人、清空通过态与 transfers，剩余人待审 */
export function resetSnapshotNodeForReapproval(node: SnapshotNode): SnapshotNode {
  const remaining = stripTransferAddedApprovers(
    node.approvers ?? [],
    node.transfers,
  ).map((a) => ({
    ...a,
    participation: 'pending',
  }));

  return {
    node_id: node.node_id,
    sign_type: node.sign_type,
    approvers: remaining,
    approved_by: [],
    transfers: {},
  };
}

/** 整份流程快照重置（不修改入参） */
export function resetFlowSnapshotForReapproval(
  snapshot: FlowSnapshot,
): FlowSnapshot {
  return {
    nodes: (snapshot.nodes ?? []).map((n) => resetSnapshotNodeForReapproval(n)),
  };
}

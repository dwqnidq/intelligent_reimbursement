import http from "./http";

export interface ApproverInfo {
  name: string;
  avatar: string;
  dept_name: string;
  position: string;
}

export interface SnapshotNode {
  node_id: string;
  name: string;
  sign_type: "countersign" | "orsign";
  approver: ApproverInfo;
}

export interface ApprovalAction {
  node_id: string;
  approver_name: string;
  action: "approve" | "reject";
  comment: string;
  acted_at: string;
}

export interface ApprovalRecordItem {
  _id: string;
  record_id: string;
  flow_snapshot: {
    name: string;
    nodes: SnapshotNode[];
  };
  cur_node_idx: number;
  status: "pending" | "approved" | "rejected";
  actions: ApprovalAction[];
}

export const getMyPendingApprovals = () =>
  http.get<ApprovalRecordItem[]>("/approvals/mine");

export const approveRecord = (id: string, comment?: string) =>
  http.post<ApprovalRecordItem>(`/approvals/${id}/approve`, { comment });

export const rejectRecord = (id: string, comment?: string) =>
  http.post<ApprovalRecordItem>(`/approvals/${id}/reject`, { comment });

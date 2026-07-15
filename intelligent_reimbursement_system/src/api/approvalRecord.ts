import http from "./http";

export interface ApproverInfo {
  approver_id?: string;
  name: string;
  avatar: string;
  dept_name: string;
  position: string;
  notify?: boolean;
  participation?: "pending" | "approved" | "skipped" | "rejected";
}

export interface SnapshotNode {
  node_id: string;
  sign_type: "countersign" | "orsign";
  approvers: ApproverInfo[];
  approved_by: string[];
  transfers?: Record<string, string>;
}

export interface ApprovalAction {
  node_id: string;
  approver_name: string;
  action: "approve" | "reject" | "transfer";
  comment: string;
  acted_at: string;
  transferred_to_name?: string;
}

export interface ApprovalRecordItem {
  _id: string;
  record_id: string;
  flow_snapshot: {
    nodes: SnapshotNode[];
  };
  cur_node_idx: number;
  status: "pending" | "approved" | "rejected";
  actions: ApprovalAction[];
}

export interface PendingApprovalItem {
  approval_record: ApprovalRecordItem;
  reimbursement: {
    _id: string;
    category: string;
    amount: number;
    apply_date: string | null;
    status: string;
    is_over_limit: boolean;
    applicant_name: string;
    attachments: string[];
    reject_reason: string | null;
  };
  ui_state?: "pending" | "skipped";
  approved_by_name?: string;
}

export interface ApprovalHistoryItem {
  approval_record: ApprovalRecordItem;
  reimbursement: {
    _id: string;
    category: string;
    amount: number;
    apply_date: string | null;
    status: string;
    is_over_limit: boolean;
    applicant_name: string;
  };
  my_action: {
    action: "approve" | "reject" | "transfer";
    acted_at: string;
    comment: string;
    transferred_to_name?: string;
  } | null;
}

export const getMyPendingApprovals = () =>
  http.get<PendingApprovalItem[]>("/approvals/mine", {
    skipErrorToast: true,
  });

export const getMyApprovalHistory = () =>
  http.get<ApprovalHistoryItem[]>("/approvals/history", {
    skipErrorToast: true,
  });

export const approveRecord = (id: string, comment?: string) =>
  http.post<ApprovalRecordItem>(`/approvals/${id}/approve`, { comment });

export const rejectRecord = (id: string, comment?: string) =>
  http.post<ApprovalRecordItem>(`/approvals/${id}/reject`, { comment });

export const getApprovalRecordByReimbursement = (reimbursementId: string) =>
  http.get<ApprovalRecordItem | null>(`/approvals/record/${reimbursementId}`, {
    skipErrorToast: true,
  });

export const transferRecord = (
  id: string,
  targetEmployeeId: string,
  comment?: string,
) =>
  http.post<ApprovalRecordItem>(`/approvals/${id}/transfer`, {
    target_employee_id: targetEmployeeId,
    comment,
  });

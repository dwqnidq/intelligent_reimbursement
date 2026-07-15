import http from "./http";

export interface ApprovalNodeData {
  node_id: string;
  approver_ids: string[];
  /** 与 approver_ids 等长；是否向该审批人推送 */
  notify_flags?: boolean[];
  sign_type: "countersign" | "orsign";
  sort: number;
}

export interface ApproverDetail {
  _id: string;
  name: string;
  avatar: string;
  position: string;
  dept_id: { _id: string; name: string };
}

export interface ApprovalFlow {
  _id: string;
  type_code: string;
  enabled: boolean;
  nodes: (Omit<ApprovalNodeData, "approver_ids"> & {
    approver_ids: ApproverDetail[];
  })[];
  created_by?: { _id: string; real_name: string };
  amount_min?: number;
  amount_max?: number | null;
  priority?: number;
}

export interface CreateApprovalFlowParams {
  type_code: string;
  enabled?: boolean;
  nodes: ApprovalNodeData[];
  amount_min?: number;
  amount_max?: number;
  priority?: number;
}

export const getApprovalFlows = () =>
  http.get<ApprovalFlow[]>("/approval-flows");

export const getApprovalFlow = (id: string) =>
  http.get<ApprovalFlow>(`/approval-flows/${id}`);

export const createApprovalFlow = (params: CreateApprovalFlowParams) =>
  http.post<{ id: string }>("/approval-flows", params);

export const updateApprovalFlow = (
  id: string,
  params: Partial<CreateApprovalFlowParams>,
) => http.put<{ id: string }>(`/approval-flows/${id}`, params);

export const toggleApprovalFlow = (id: string) =>
  http.patch<{ id: string; enabled: boolean }>(`/approval-flows/${id}/toggle`);

export const deleteApprovalFlow = (id: string) =>
  http.delete<{ id: string }>(`/approval-flows/${id}`);

export const reorderApprovalFlows = (ids: string[]) =>
  http.post<{ success: boolean }>("/approval-flows/reorder", { ids });

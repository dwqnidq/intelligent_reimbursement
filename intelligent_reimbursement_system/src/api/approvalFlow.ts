import http from "./http";

export interface ApprovalNodeData {
  node_id: string;
  name: string;
  approver_id: string;
  sign_type: "countersign" | "orsign";
  sort: number;
}

export interface ApprovalFlow {
  _id: string;
  name: string;
  type_code: string;
  enabled: boolean;
  nodes: (ApprovalNodeData & {
    approver_id: {
      _id: string;
      name: string;
      avatar: string;
      position: string;
      dept_id: { _id: string; name: string };
    };
  })[];
  created_by?: { _id: string; real_name: string };
}

export interface CreateApprovalFlowParams {
  name: string;
  type_code: string;
  enabled?: boolean;
  nodes: ApprovalNodeData[];
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

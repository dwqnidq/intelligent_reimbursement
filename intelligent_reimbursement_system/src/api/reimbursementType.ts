import http from "./http";

export interface FieldOption {
  label: string;
  value: string;
}

export interface TypeFieldPayload {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "select" | "textarea";
  required: boolean;
  sort: number;
  options: FieldOption[];
}

export interface ExportFieldPayload {
  key: string;
  label: string;
  sort: number;
  formula?: string;
  is_calculate?: boolean;
  calc_fields?: string[];
}

export interface CreateReimbursementTypeParams {
  code: string;
  label: string;
  remark?: string;
  formula?: string;
  over_limit_threshold?: number;
  status: 0 | 1;
  fields: TypeFieldPayload[];
  export_fields?: ExportFieldPayload[];
}

export const createReimbursementType = (
  params: CreateReimbursementTypeParams,
) => http.post<void>("/reimbursement-types", params);

export const deleteReimbursementType = (id: string) =>
  http.delete<void>(`/reimbursement-types/${id}`);

export interface UpdateReimbursementTypeParams {
  code?: string;
  label?: string;
  formula?: string;
  over_limit_threshold?: number;
  status?: 0 | 1;
  fields?: TypeFieldPayload[];
  export_fields?: ExportFieldPayload[];
}

export const updateReimbursementType = (
  id: string,
  params: UpdateReimbursementTypeParams,
) => http.put<void>(`/reimbursement-types/${id}`, params);

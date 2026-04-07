import http from "./http";

export type FieldType = "text" | "number" | "select" | "date" | "textarea";

export interface TypeField {
  _id: string;
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  options: { label: string; value: string }[];
  sort: number;
  is_calculate?: boolean;
}

export interface ExportField {
  key: string;
  label: string;
  sort: number;
  is_calculate: boolean;
  formula?: string;
  calc_fields?: string[];
}

export interface ReimbursementType {
  _id: string;
  code: string;
  label: string;
  fields: TypeField[];
  export_fields: ExportField[];
  formula?: string;
  over_limit_threshold?: number;
}

export interface ReimbursementRecord {
  _id: string;
  category: string;
  applicant_name?: string;
  amount: number;
  total_price?: number;
  is_over_limit?: boolean;
  attachments: string[];
  status: "pending" | "approved" | "rejected";
  approver: string | null;
  approved_at: string | null;
  reject_reason: string | null;
  apply_date: string | null;
  detail: { label: string; value: string }[] | null;
}

export interface ReimbursementListResult {
  list: ReimbursementRecord[];
  total: number;
  page: number;
  size: number;
}

export interface CreateReimbursementParams {
  applicant_name: string;
  category: string;
  amount?: number;
  detail: Record<string, unknown>;
  attachments: string[];
  apply_date: string;
}

export interface ReimbursementListParams {
  page?: number;
  size?: number;
  category?: string;
  status?: string;
  min_amount?: number;
  max_amount?: number;
  start_date?: string;
  end_date?: string;
}

export const getReimbursementTypes = () =>
  http.get<ReimbursementType[]>("/reimbursement-types");

export const getReimbursementList = (params?: ReimbursementListParams) =>
  http.get<ReimbursementListResult>("/reimbursements", { params });

export const searchReimbursement = (params: ReimbursementListParams) =>
  http.get<ReimbursementListResult>("/reimbursements", { params });

export const createReimbursement = (params: CreateReimbursementParams) =>
  http.post<void>("/reimbursements", params);

export interface UpdateStatusParams {
  status: "pending" | "approved" | "rejected" | "withdrawn";
  reject_reason?: string;
}

export const updateReimbursementStatus = (
  id: string,
  params: UpdateStatusParams,
) => http.patch<void>(`/reimbursements/${id}`, params);

export const withdrawReimbursement = (id: string) =>
  http.patch<void>(`/reimbursements/${id}`, { status: "withdrawn" });

export const exportReimbursementsExcel = (
  params?: ReimbursementListParams & { categories?: string[] },
) => {
  // 多类型转逗号分隔传给后端
  const { categories, ...rest } = params ?? {};
  const queryParams = {
    ...rest,
    ...(categories && categories.length > 0
      ? { category: categories.join(",") }
      : {}),
  };
  return http
    .get("/reimbursements/export", {
      params: queryParams,
      responseType: "blob",
    })
    .then((blob: Blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reimbursements_${Date.now()}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    });
};

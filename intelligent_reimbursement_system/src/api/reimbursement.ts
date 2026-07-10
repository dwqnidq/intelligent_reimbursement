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
  name: string;
  label: string;
  fields: TypeField[];
  export_fields: ExportField[];
  formula?: string;
  over_limit_threshold?: number;
}

export interface ReimbursementRecord {
  _id: string;
  submission_batch_id?: string;
  category: string;
  applicant_name?: string;
  department_name?: string;
  payment_account?: string;
  company_id?: string;
  company_name?: string;
  amount: number;
  total_price?: number;
  is_over_limit?: boolean;
  has_approval_flow?: boolean;
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

export interface ReimbursementTreeGroup {
  key: string;
  _id: string;
  is_group: true;
  submission_batch_id: string;
  applicant_name: string | null;
  apply_date: string | null;
  total_amount: number;
  count: number;
  status: "pending" | "approved" | "rejected" | "mixed";
  children: ReimbursementRecord[];
}

export interface ReimbursementTreeResult {
  list: ReimbursementTreeGroup[];
  total: number;
  page: number;
  size: number;
}

/** 与 Nest CreateReimbursementDto 一致，为请求体数组中的单项 */
export interface InvoiceInfoParams {
  invoice_number?: string;
  invoice_title?: string;
  invoice_date?: string;
  issuer?: string;
}

export interface CreateReimbursementParams {
  applicant_name: string;
  category: string;
  department_name: string;
  /** 该包内每条 detail 对应数据库一条记录，至少 1 条 */
  details: Record<string, unknown>[];
  attachments: string[];
  apply_date: string;
  invoice_number?: string;
  invoice_info?: InvoiceInfoParams;
}

export interface CreateReimbursementResult {
  ids: string[];
  count: number;
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

export const getReimbursementTreeList = (params?: ReimbursementListParams) =>
  http.get<ReimbursementTreeResult>("/reimbursements/tree", { params });

/** 请求体为数组：每项一包；前端多行表单通常映射为 [{..., details:[row1]}, {..., details:[row2]}, ...] */
export const checkInvoiceNumber = (number: string) =>
  http.get<{ available: boolean; invoice_number: string; message?: string }>(
    "/reimbursements/invoice-check",
    { params: { number } },
  );

export const createReimbursement = (payload: CreateReimbursementParams[]) =>
  http.post<CreateReimbursementResult>("/reimbursements", payload);

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

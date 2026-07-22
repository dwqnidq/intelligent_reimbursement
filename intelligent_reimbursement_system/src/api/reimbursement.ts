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
  description?: string;
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
  /** 逗号分隔多状态，如 pending,approved */
  status?: string;
  min_amount?: number;
  max_amount?: number;
  start_date?: string;
  end_date?: string;
  /** 逗号分隔员工 ID */
  employee_ids?: string;
  /** 逗号分隔部门 ID（含子部门） */
  department_ids?: string;
}

export const getReimbursementTypes = () =>
  http.get<ReimbursementType[]>("/reimbursement-types");

export const getReimbursementList = (params?: ReimbursementListParams) =>
  http.get<ReimbursementListResult>("/reimbursements", { params });

export const searchReimbursement = (params: ReimbursementListParams) =>
  http.get<ReimbursementListResult>("/reimbursements", { params });

export const getReimbursementTreeList = (params?: ReimbursementListParams) =>
  http.get<ReimbursementTreeResult>("/reimbursements/tree", { params });

export const getReimbursementById = (id: string) =>
  http.get<ReimbursementRecord>(`/reimbursements/${id}`);

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

async function readBlobErrorMessage(data: unknown): Promise<string | null> {
  if (!(data instanceof Blob)) return null;
  try {
    const text = await data.text();
    const body = JSON.parse(text) as { message?: string };
    return body.message ?? null;
  } catch {
    return null;
  }
}

export interface ExportProgressEvent {
  type: "progress";
  percent: number;
  message: string;
  current?: number;
  total?: number;
}

export interface ExportDoneEvent {
  type: "done";
  token: string;
  filename: string;
}

export interface ExportErrorEvent {
  type: "error";
  message: string;
}

export type ExportStreamEvent =
  | ExportProgressEvent
  | ExportDoneEvent
  | ExportErrorEvent;

function getToken(): string {
  try {
    const raw = localStorage.getItem("auth-storage");
    return raw ? (JSON.parse(raw)?.state?.token ?? "") : "";
  } catch {
    return "";
  }
}

function buildExportQueryParams(
  params?: ReimbursementListParams & {
    categories?: string[];
    statuses?: string[];
    employee_ids?: string[];
    department_ids?: string[];
  },
): Record<string, string | number | undefined> {
  const p = params ?? {};
  const queryParams: Record<string, string | number | undefined> = {
    min_amount: p.min_amount,
    max_amount: p.max_amount,
    start_date: p.start_date,
    end_date: p.end_date,
  };
  if (p.categories && p.categories.length > 0) {
    queryParams.category = p.categories.join(",");
  }
  if (p.statuses && p.statuses.length > 0) {
    queryParams.status = p.statuses.join(",");
  } else if (p.status) {
    queryParams.status = p.status;
  }
  const empIds = p.employee_ids;
  if (Array.isArray(empIds) && empIds.length > 0) {
    queryParams.employee_ids = empIds.join(",");
  } else if (typeof empIds === "string" && empIds) {
    queryParams.employee_ids = empIds;
  }
  const deptIds = p.department_ids;
  if (Array.isArray(deptIds) && deptIds.length > 0) {
    queryParams.department_ids = deptIds.join(",");
  } else if (typeof deptIds === "string" && deptIds) {
    queryParams.department_ids = deptIds;
  }
  return queryParams;
}

export async function exportReimbursementsExcelWithProgress(
  params: ReimbursementListParams & {
    categories?: string[];
    statuses?: string[];
    employee_ids?: string[];
    department_ids?: string[];
  },
  onProgress: (event: ExportProgressEvent) => void,
): Promise<void> {
  const query = new URLSearchParams();
  const queryParams = buildExportQueryParams(params);
  for (const [key, value] of Object.entries(queryParams)) {
    if (value !== undefined && value !== "") {
      query.append(key, String(value));
    }
  }

  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "/api";
  const response = await fetch(
    `${baseUrl}/reimbursements/export/stream?${query.toString()}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
      credentials: "include",
    },
  );

  if (!response.ok || !response.body) {
    throw new Error("导出请求失败");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let doneEvent: ExportDoneEvent | null = null;
  let errorMessage: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const jsonStr = line.slice(5).trim();
      if (!jsonStr) continue;
      try {
        const event = JSON.parse(jsonStr) as ExportStreamEvent;
        if (event.type === "progress") {
          onProgress(event);
        } else if (event.type === "done") {
          doneEvent = event;
        } else if (event.type === "error") {
          errorMessage = event.message;
        }
      } catch {
        // ignore malformed chunk
      }
    }
  }

  if (errorMessage) {
    throw new Error(errorMessage);
  }
  if (!doneEvent) {
    throw new Error("导出未完成，请重试");
  }

  const blob = await http.get<Blob>(
    `/reimbursements/export/file/${doneEvent.token}`,
    {
      responseType: "blob",
      skipErrorToast: true,
      timeout: 120000,
    },
  );

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = doneEvent.filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportReimbursementsExcel(
  params?: ReimbursementListParams & {
    categories?: string[];
    statuses?: string[];
    employee_ids?: string[];
    department_ids?: string[];
  },
) {
  const queryParams = buildExportQueryParams(params);
  try {
    const blob = await http.get<Blob>("/reimbursements/export", {
      params: queryParams,
      responseType: "blob",
      skipErrorToast: true,
      timeout: 120000,
    });
    if (blob.type.includes("application/json")) {
      const msg = await readBlobErrorMessage(blob);
      throw new Error(msg ?? "没有可导出的报销记录");
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reimbursements_${Date.now()}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    const ax = error as { response?: { data?: unknown } };
    if (ax.response?.data) {
      const msg = await readBlobErrorMessage(ax.response.data);
      if (msg) throw new Error(msg);
    }
    throw error;
  }
}

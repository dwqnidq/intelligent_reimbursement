import http from "./http";

export interface ReimbursementFormSettings {
  smart_fill_enabled: boolean;
  manual_fill_enabled: boolean;
}

export const getReimbursementFormSettings = () =>
  http.get<ReimbursementFormSettings>("/reimbursement-form-settings");

export const updateReimbursementFormSettings = (
  params: ReimbursementFormSettings,
) => http.put<ReimbursementFormSettings>("/reimbursement-form-settings", params);

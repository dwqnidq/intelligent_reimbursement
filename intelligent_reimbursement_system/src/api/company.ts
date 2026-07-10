import http from "./http";

export interface Company {
  _id: string;
  name: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CompanyNameOption {
  _id: string;
  name: string;
}

export const getCompanyNameOptions = () =>
  http.get<CompanyNameOption[]>("/companies/name-options");

export const getCompanies = () => http.get<Company[]>("/companies");

export const createCompany = (params: { name: string }) =>
  http.post<{ id: string }>("/companies", params);

export const updateCompany = (id: string, params: { name: string }) =>
  http.put<{ id: string }>(`/companies/${id}`, params);

export const deleteCompany = (id: string) =>
  http.delete<{ id: string }>(`/companies/${id}`);

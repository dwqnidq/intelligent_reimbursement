import http from "./http";

export interface Department {
  _id: string;
  name: string;
  code: string;
  manager_id?: { _id: string; name: string; avatar: string; position: string };
  description?: string;
  status: number;
  sort: number;
}

export interface CreateDepartmentParams {
  name: string;
  code: string;
  manager_id?: string;
  description?: string;
  status?: number;
  sort?: number;
}

export const getDepartments = (params?: { status?: number }) =>
  http.get<Department[]>("/departments", { params });

export const createDepartment = (params: CreateDepartmentParams) =>
  http.post<{ id: string }>("/departments", params);

export const updateDepartment = (id: string, params: Partial<CreateDepartmentParams>) =>
  http.put<{ id: string }>(`/departments/${id}`, params);

export const deleteDepartment = (id: string) =>
  http.delete<{ id: string }>(`/departments/${id}`);

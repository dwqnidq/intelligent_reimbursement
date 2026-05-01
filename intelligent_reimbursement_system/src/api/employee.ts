import http from "./http";

export interface Employee {
  _id: string;
  employee_no: string;
  name: string;
  gender: number;
  dept_id?: { _id: string; name: string; code: string };
  position?: string;
  phone?: string;
  avatar?: string;
  status: number;
}

export interface EmployeeListResponse {
  list: Employee[];
  total: number;
  page: number;
  page_size: number;
}

export interface CreateEmployeeParams {
  employee_no: string;
  name: string;
  gender: number;
  dept_id?: string;
  position?: string;
  phone?: string;
  avatar?: string;
  status?: number;
}

export const getEmployees = (params?: {
  name?: string;
  dept_id?: string;
  page?: number;
  page_size?: number;
}) => http.get<EmployeeListResponse>("/employees", { params });

export const createEmployee = (params: CreateEmployeeParams) =>
  http.post<{ id: string }>("/employees", params);

export const updateEmployee = (id: string, params: Partial<CreateEmployeeParams>) =>
  http.put<{ id: string }>(`/employees/${id}`, params);

export const deleteEmployee = (id: string) =>
  http.delete<{ id: string }>(`/employees/${id}`);

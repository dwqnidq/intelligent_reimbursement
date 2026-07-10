import http from "./http";

export interface Department {
  _id: string;
  name: string;
  code: string;
  parent_id?: string | { _id: string; name: string; code: string } | null;
  manager_id?: { _id: string; name: string; avatar: string; position: string };
  description?: string;
  status: number;
  sort: number;
  children?: Department[];
}

export interface CreateDepartmentParams {
  name: string;
  code: string;
  parent_id?: string;
  manager_id?: string;
  description?: string;
  status?: number;
  sort?: number;
}

export const getDepartments = (params?: { status?: number; tree?: boolean }) =>
  http.get<Department[]>("/departments", { params });

export const getDepartmentNameOptions = () =>
  http.get<string[]>("/departments/name-options");

export const createDepartment = (params: CreateDepartmentParams) =>
  http.post<{ id: string }>("/departments", params);

export const updateDepartment = (id: string, params: Partial<CreateDepartmentParams>) =>
  http.put<{ id: string }>(`/departments/${id}`, params);

export const deleteDepartment = (id: string) =>
  http.delete<{ id: string }>(`/departments/${id}`);

export function flattenDepartments(departments: Department[]): Department[] {
  const result: Department[] = [];
  const walk = (items: Department[]) => {
    for (const item of items) {
      const { children, ...rest } = item;
      result.push(rest);
      if (children?.length) walk(children);
    }
  };
  walk(departments);
  return result;
}

export function buildDepartmentTreeOptions(
  departments: Department[],
  excludeIds: Set<string> = new Set(),
): { title: string; value: string; children?: { title: string; value: string }[] }[] {
  return departments
    .filter((dept) => !excludeIds.has(dept._id))
    .map((dept) => ({
      title: dept.name,
      value: dept._id,
      children: dept.children?.length
        ? buildDepartmentTreeOptions(dept.children, excludeIds)
        : undefined,
    }));
}

export function collectDepartmentDescendantIds(department: Department): Set<string> {
  const ids = new Set<string>();
  const walk = (items: Department[]) => {
    for (const item of items) {
      ids.add(item._id);
      if (item.children?.length) walk(item.children);
    }
  };
  if (department.children?.length) walk(department.children);
  return ids;
}

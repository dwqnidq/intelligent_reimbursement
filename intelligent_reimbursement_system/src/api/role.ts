import http from "./http";

export interface RoleItem {
  _id: string;
  name: string;
  label: string;
  description?: string;
  status: number;
  permissions: PermissionItem[];
  menus: { _id: string; name: string; path?: string }[];
}

export interface PermissionItem {
  _id: string;
  name: string;
  label: string;
  type: "button" | "api";
  resource?: string;
  action?: string;
  description?: string;
  status: number;
}

export interface CreateRoleParams {
  name: string;
  label: string;
  description?: string;
  status?: number;
  permissions?: string[];
  menus?: string[];
}

export const getRoles = () => http.get<RoleItem[]>("/roles");

export const getRole = (id: string) => http.get<RoleItem>(`/roles/${id}`);

export const createRole = (data: CreateRoleParams) =>
  http.post<RoleItem>("/roles", data);

export const updateRole = (id: string, data: Partial<CreateRoleParams>) =>
  http.put<RoleItem>(`/roles/${id}`, data);

export const deleteRole = (id: string) => http.delete(`/roles/${id}`);

export const assignRolePermissions = (id: string, permissions: string[]) =>
  http.put<RoleItem>(`/roles/${id}/permissions`, { permissions });

export const assignRoleMenus = (id: string, menus: string[]) =>
  http.put<RoleItem>(`/roles/${id}/menus`, { menus });

export const getPermissions = () =>
  http.get<PermissionItem[]>("/permissions");

export const getAllUsers = () =>
  http.get<any[]>("/users");

export const assignUserRoles = (userId: string, roles: string[]) =>
  http.patch(`/users/${userId}/roles`, { roles });

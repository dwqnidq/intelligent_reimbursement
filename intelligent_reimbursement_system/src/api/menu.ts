import http from "./http";

export interface MenuItem {
  _id: string;
  name: string;
  path?: string;
  component?: string;
  icon?: string;
  sort: number;
  type: "directory" | "menu" | "button";
  parent_id?: string | null;
  permission?: string;
  visible: number;
  status: number;
  children?: MenuItem[];
}

export interface CreateMenuParams {
  name: string;
  path?: string;
  component?: string;
  icon?: string;
  sort?: number;
  type: "directory" | "menu" | "button";
  parent_id?: string;
  permission?: string;
  visible?: number;
  status?: number;
}

export const getMenuTree = () => http.get<MenuItem[]>("/menus");

export const getMenuFlat = () => http.get<MenuItem[]>("/menus/flat");

export const getMenu = (id: string) => http.get<MenuItem>(`/menus/${id}`);

export const createMenu = (data: CreateMenuParams) =>
  http.post<MenuItem>("/menus", data);

export const updateMenu = (id: string, data: Partial<CreateMenuParams>) =>
  http.put<MenuItem>(`/menus/${id}`, data);

export const deleteMenu = (id: string) => http.delete(`/menus/${id}`);

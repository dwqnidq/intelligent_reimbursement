import http from "./http";

export interface LoginParams {
  username: string;
  password: string;
}

export interface UserInfo {
  id: string;
  username: string;
  real_name: string;
  email: string;
  avatar?: string;
  password_login_enabled?: boolean;
}

export interface MenuItem {
  _id: string;
  name: string;
  icon: string;
  sort: number;
  type: "directory" | "menu";
  path: string | null;
  component: string | null;
  visible: number;
  children: MenuItem[];
}

export interface LoginResult {
  token: string;
  user: UserInfo;
  permissions: string[];
  menus: MenuItem[];
}

export interface RegisterParams {
  username: string;
  password: string;
  email: string;
  real_name: string;
  phone?: string;
  department?: string;
}

export const login = (params: LoginParams) =>
  http.post<LoginResult>("/users/login", params);

export const register = (params: RegisterParams) =>
  http.post<void>("/users", params);

export const updateAvatar = (file: File) => {
  const formData = new FormData();
  formData.append("file", file);
  return http.patch<{ avatar: string }>("/users/avatar", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

export const changePassword = (params: {
  old_password: string;
  new_password: string;
}) => http.patch<void>("/users/password", params);

export const setupPassword = (params: { new_password: string }) =>
  http.patch<void>("/users/password/setup", params);

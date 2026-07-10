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
  payment_account?: string;
  company_id?: string;
  company_name?: string;
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
  refreshToken: string;
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

export const refreshToken = (refreshTokenValue: string) =>
  http.post<Pick<LoginResult, "token" | "refreshToken">>("/users/refresh-token", {
    refreshToken: refreshTokenValue,
  });

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

export const updateProfile = (params: { username: string; email: string }) =>
  http.patch<{ user: UserInfo }>("/users/profile", params);

export const updateProfileSetup = (params: {
  company_id: string;
  payment_account: string;
}) =>
  http.patch<{
    company_id: string;
    company_name: string;
    payment_account: string;
    user: UserInfo;
  }>("/users/profile-setup", params);

export const updatePaymentAccount = (params: { payment_account: string }) =>
  http.patch<{ payment_account: string; user: UserInfo }>(
    "/users/payment-account",
    params,
  );

import axios from "axios";
import type { AxiosRequestConfig } from "axios";
import { message } from "antd";
import { useAuthStore } from "../store/useAuthStore";
import type { MenuItem, UserInfo } from "./user";

export interface HttpRequestConfig extends AxiosRequestConfig {
  /** 为 true 时不弹出全局错误提示（调用方自行处理） */
  skipErrorToast?: boolean;
}

interface AuthStorageState {
  state?: {
    token?: string;
    refreshToken?: string;
  };
}

interface RefreshSessionPayload {
  token: string;
  refreshToken: string;
  permissions?: string[];
  menus?: MenuItem[];
  user?: UserInfo;
}

const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 10000,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

let refreshingPromise: Promise<RefreshSessionPayload> | null = null;

function getAuthStorage() {
  try {
    const raw = localStorage.getItem("auth-storage");
    return raw ? (JSON.parse(raw) as AuthStorageState) : null;
  } catch {
    return null;
  }
}

function getStoredToken() {
  return getAuthStorage()?.state?.token ?? "";
}

function getStoredRefreshToken() {
  return getAuthStorage()?.state?.refreshToken ?? "";
}

function redirectToLogin() {
  useAuthStore.getState().clearAuth();
  if (window.location.pathname !== "/login") {
    window.location.replace("/login");
  }
}

async function doRefreshToken() {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) {
    throw new Error("缺少 refreshToken");
  }

  const response = await axios.post(
    "/users/refresh-token",
    { refreshToken },
    {
      baseURL: import.meta.env.VITE_API_BASE_URL,
      withCredentials: true,
      timeout: 10000,
      headers: { "Content-Type": "application/json" },
    },
  );

  const payload = response.data?.data ?? response.data;
  if (!payload?.token || !payload?.refreshToken) {
    throw new Error("refreshToken 响应格式错误");
  }
  return {
    token: payload.token as string,
    refreshToken: payload.refreshToken as string,
    permissions: payload.permissions as string[] | undefined,
    menus: payload.menus as MenuItem[] | undefined,
    user: payload.user as UserInfo | undefined,
  };
}

// 请求拦截器：从 zustand store 读取 token
axiosInstance.interceptors.request.use(
  (config) => {
    const token = getStoredToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error),
);

// 响应拦截器：统一处理业务状态码和错误提示
axiosInstance.interceptors.response.use(
  (response) => {
    if (response.config.responseType === "blob") {
      return response.data;
    }
    const { data } = response;
    if (data.code !== undefined && data.code !== 0 && data.code !== 200) {
      message.error(data.message ?? "请求失败");
      return Promise.reject(new Error(data.message ?? "请求失败"));
    }
    if (data.message && data.message !== "ok" && data.code !== undefined) {
      message.success(data.message);
    }
    return data.data ?? data;
  },
  async (error) => {
    const originalRequest = error.config as HttpRequestConfig & { _retry?: boolean };
    const status = error.response?.status;
    const isRefreshRequest = originalRequest?.url?.includes("/users/refresh-token");
    const skipErrorToast = originalRequest?.skipErrorToast === true;

    if (status === 401 && originalRequest && !originalRequest._retry && !isRefreshRequest) {
      originalRequest._retry = true;
      try {
        refreshingPromise = refreshingPromise ?? doRefreshToken();
        const refreshed = await refreshingPromise;
        const currentState = useAuthStore.getState();
        if (currentState.user || refreshed.user) {
          currentState.setAuth({
            token: refreshed.token,
            refreshToken: refreshed.refreshToken,
            user: refreshed.user ?? currentState.user!,
            permissions: refreshed.permissions ?? currentState.permissions,
            menus: refreshed.menus ?? currentState.menus,
          });
        }
        originalRequest.headers = {
          ...(originalRequest.headers ?? {}),
          Authorization: `Bearer ${refreshed.token}`,
        };
        return axiosInstance(originalRequest);
      } catch {
        redirectToLogin();
        return Promise.reject(error);
      } finally {
        refreshingPromise = null;
      }
    }

    if (status === 401) {
      redirectToLogin();
    }

    let backendMessage: string | undefined;
    if (error.response?.data instanceof Blob) {
      try {
        const text = await error.response.data.text();
        backendMessage = JSON.parse(text)?.message;
      } catch {
        backendMessage = undefined;
      }
    } else {
      backendMessage = error.response?.data?.message;
    }
    const msgMap: Record<number, string> = {
      400: "请求参数错误",
      401: "未登录或登录已过期",
      403: "无权限访问",
      404: "请求资源不存在",
      500: "服务器内部错误",
    };
    const errMsg =
      (Array.isArray(backendMessage) ? backendMessage[0] : backendMessage) ??
      msgMap[status] ??
      error.message ??
      "网络异常";
    if (!(status === 401 && !isRefreshRequest) && !skipErrorToast) {
      message.error(errMsg);
    }
    return Promise.reject(error);
  },
);

// 包装成直接返回业务数据的类型
const http = {
  get: <T = unknown>(url: string, config?: HttpRequestConfig): Promise<T> =>
    axiosInstance.get(url, config),
  post: <T = unknown>(
    url: string,
    data?: unknown,
    config?: HttpRequestConfig,
  ): Promise<T> => axiosInstance.post(url, data, config),
  put: <T = unknown>(
    url: string,
    data?: unknown,
    config?: HttpRequestConfig,
  ): Promise<T> => axiosInstance.put(url, data, config),
  patch: <T = unknown>(
    url: string,
    data?: unknown,
    config?: HttpRequestConfig,
  ): Promise<T> => axiosInstance.patch(url, data, config),
  delete: <T = unknown>(url: string, config?: HttpRequestConfig): Promise<T> =>
    axiosInstance.delete(url, config),
};

export default http;

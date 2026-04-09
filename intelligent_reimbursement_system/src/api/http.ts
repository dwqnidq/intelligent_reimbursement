import axios from "axios";
import type { AxiosRequestConfig } from "axios";
import { message } from "antd";

const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 10000,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

// 请求拦截器：从 zustand store 读取 token
axiosInstance.interceptors.request.use(
  (config) => {
    const raw = localStorage.getItem("auth-storage");
    const token = raw ? JSON.parse(raw)?.state?.token : "";
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
    const status = error.response?.status;
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
    message.error(errMsg);
    return Promise.reject(error);
  },
);

// 包装成直接返回业务数据的类型
const http = {
  get: <T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> =>
    axiosInstance.get(url, config),
  post: <T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T> => axiosInstance.post(url, data, config),
  put: <T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T> => axiosInstance.put(url, data, config),
  patch: <T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T> => axiosInstance.patch(url, data, config),
  delete: <T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> =>
    axiosInstance.delete(url, config),
};

export default http;

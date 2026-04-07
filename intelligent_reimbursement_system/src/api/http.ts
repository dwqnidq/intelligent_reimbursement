import axios from 'axios'
import { message } from 'antd'

const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
})

// 请求拦截器：从 zustand store 读取 token
http.interceptors.request.use(
  (config) => {
    // persist 中间件会把数据存在 localStorage 的 auth-storage key 下
    const raw = localStorage.getItem('auth-storage')
    const token = raw ? JSON.parse(raw)?.state?.token : ''
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
  },
  (error) => Promise.reject(error)
)

// 响应拦截器：统一处理业务状态码和错误提示
http.interceptors.response.use(
  (response) => {
    // blob 响应（文件下载）直接返回，不做业务处理
    if (response.config.responseType === 'blob') {
      return response.data
    }

    const { data } = response
    // 业务层失败（接口返回 code 非 0/200）
    if (data.code !== undefined && data.code !== 0 && data.code !== 200) {
      message.error(data.message ?? '请求失败')
      return Promise.reject(new Error(data.message ?? '请求失败'))
    }
    // 成功时如果后端带了 message 字段且不是 ok，弹出提示
    if (data.message && data.message !== 'ok' && data.code !== undefined) {
      message.success(data.message)
    }
    // 直接返回 data 字段，页面无需再 .data.data
    return data.data ?? data
  },
  async (error) => {
    const status = error.response?.status

    // blob 响应出错时，data 是 Blob，需要先解析成 JSON
    let backendMessage: string | undefined
    if (error.response?.data instanceof Blob) {
      try {
        const text = await error.response.data.text()
        backendMessage = JSON.parse(text)?.message
      } catch {
        backendMessage = undefined
      }
    } else {
      backendMessage = error.response?.data?.message
    }

    const msgMap: Record<number, string> = {
      400: '请求参数错误',
      401: '未登录或登录已过期',
      403: '无权限访问',
      404: '请求资源不存在',
      500: '服务器内部错误',
    }
    const errMsg = (Array.isArray(backendMessage) ? backendMessage[0] : backendMessage)
      ?? msgMap[status]
      ?? error.message
      ?? '网络异常'
    message.error(errMsg)
    return Promise.reject(error)
  }
)

export default http

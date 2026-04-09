import { useState } from 'react'
import { Form, Input, Button, Select, message } from 'antd'
import { useNavigate } from 'react-router-dom'
import { register } from '../api/user'
import type { RegisterParams } from '../api/user'

const departmentOptions = [
  { label: '技术部', value: '技术部' },
  { label: '市场部', value: '市场部' },
  { label: '财务部', value: '财务部' },
  { label: '行政部', value: '行政部' },
  { label: '人事部', value: '人事部' },
]

export default function RegisterPage() {
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)

  const onFinish = async (values: RegisterParams) => {
    setLoading(true)
    try {
      await register(values)
      message.success('注册成功，请登录')
      navigate('/login', { replace: true })
    } catch {
      // 错误已由拦截器统一提示
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-screen bg-gray-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm max-h-full overflow-y-auto scrollbar-hide">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-blue-500 mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-800">创建账号</h1>
          <p className="text-sm text-gray-400 mt-1">填写信息完成注册</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-8">
          <Form form={form} layout="vertical" onFinish={onFinish} size="large">
            <Form.Item
              label="用户名"
              name="username"
              rules={[{ required: true, message: '请输入用户名' }]}
            >
              <Input placeholder="请输入登录用户名" />
            </Form.Item>

            <Form.Item
              label="真实姓名"
              name="real_name"
              rules={[{ required: true, message: '请输入真实姓名' }]}
            >
              <Input placeholder="请输入真实姓名" />
            </Form.Item>

            <Form.Item
              label="邮箱"
              name="email"
              rules={[
                { required: true, message: '请输入邮箱' },
                { type: 'email', message: '邮箱格式不正确' },
              ]}
            >
              <Input placeholder="请输入邮箱" />
            </Form.Item>

            <Form.Item
              label="密码"
              name="password"
              rules={[
                { required: true, message: '请输入密码' },
                { min: 6, message: '密码至少 6 位' },
              ]}
            >
              <Input.Password placeholder="请输入密码（至少 6 位）" />
            </Form.Item>

            <Form.Item
              label="手机号"
              name="phone"
              rules={[{ pattern: /^1[3-9]\d{9}$/, message: '手机号格式不正确' }]}
            >
              <Input placeholder="请输入手机号（选填）" />
            </Form.Item>

            <Form.Item label="部门" name="department">
              <Select placeholder="请选择部门（选填）" options={departmentOptions} allowClear />
            </Form.Item>

            <Form.Item className="mb-0 mt-2">
              <Button type="primary" htmlType="submit" className="w-full" size="large" loading={loading}>
                注册
              </Button>
            </Form.Item>
          </Form>
        </div>

        <p className="text-center text-sm text-gray-400 mt-4">
          已有账号？
          <a className="text-blue-500 hover:text-blue-600 ml-1 cursor-pointer" onClick={() => navigate('/login')}>
            立即登录
          </a>
        </p>
      </div>
    </div>
  )
}

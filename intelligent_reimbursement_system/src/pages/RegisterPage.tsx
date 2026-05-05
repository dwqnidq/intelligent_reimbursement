import { useState, useEffect } from 'react'
import { Form, Input, Button, Select, message } from 'antd'
import { useNavigate } from 'react-router-dom'
import { register } from '../api/user'
import type { RegisterParams } from '../api/user'
import { getDepartments } from '../api/department'

export default function RegisterPage() {
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [departmentOptions, setDepartmentOptions] = useState<{ label: string; value: string }[]>([])

  useEffect(() => {
    getDepartments({ status: 1 }).then((data) => {
      setDepartmentOptions(
        (Array.isArray(data) ? data : []).map((d) => ({ label: d.name, value: d.name }))
      )
    }).catch(() => {})
  }, [])

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
    <div
      className="h-screen flex items-center justify-center px-4 py-8 relative"
      style={{ background: "linear-gradient(135deg, #dbeafe 0%, #eff6ff 50%, #f0f9ff 100%)" }}
    >
      <div
        style={{
          position: "absolute", top: "-100px", right: "-80px",
          width: "450px", height: "450px", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(37,99,235,0.15) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute", bottom: "-120px", left: "-100px",
          width: "500px", height: "500px", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(37,99,235,0.12) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div className="w-full max-w-sm max-h-full overflow-y-auto scrollbar-hide relative" style={{ zIndex: 1 }}>
        {/* Logo */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center rounded-2xl mb-5"
            style={{
              width: 56, height: 56,
              background: "#2563eb",
              boxShadow: "0 8px 30px rgba(37, 99, 235, 0.3)",
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">创建账号</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-2">填写信息完成注册</p>
        </div>

        <div
          className="bg-[var(--bg-card)] rounded-2xl p-8 border border-[var(--border-color)]"
          style={{ boxShadow: "0 4px 30px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04)" }}
        >
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
              <Button type="primary" htmlType="submit" className="w-full !h-11 !text-[15px] !font-semibold" size="large" loading={loading}>
                注册
              </Button>
            </Form.Item>
          </Form>
        </div>

        <p className="text-center text-sm text-[var(--text-secondary)] mt-7">
          已有账号？
          <a className="text-[var(--color-primary)] hover:opacity-80 ml-1 cursor-pointer transition-opacity font-medium" onClick={() => navigate('/login')}>
            立即登录
          </a>
        </p>
      </div>
    </div>
  )
}

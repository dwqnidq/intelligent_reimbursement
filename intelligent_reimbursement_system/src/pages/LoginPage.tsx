import { useState } from "react";
import { Form, Input, Button, message } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
import { useNavigate, useLocation } from "react-router-dom";
import { login } from "../api/user";
import type { LoginParams } from "../api/user";
import { useAuthStore } from "../store/useAuthStore";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);

  const onFinish = async (values: LoginParams) => {
    setLoading(true);
    try {
      const res = await login(values);
      setAuth({
        token: res.token,
        user: res.user,
        permissions: res.permissions,
        menus: res.menus,
      });
      message.success("登录成功");
      // 递归找第一个有 path 的菜单
      const findFirstPath = (menus: typeof res.menus): string | null => {
        for (const m of menus) {
          if (m.path) return m.path;
          if (m.children?.length) {
            const found = findFirstPath(m.children);
            if (found) return found;
          }
        }
        return null;
      };
      const from =
        (location.state as { from?: Location })?.from?.pathname ??
        findFirstPath(res.menus) ??
        "/";
      navigate(from, { replace: true });
    } catch {
      // 错误已由拦截器统一提示
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo 区域 */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-blue-500 mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-800">报销管理系统</h1>
          <p className="text-sm text-gray-400 mt-1">请登录您的账号</p>
        </div>

        {/* 表单 */}
        <div className="bg-white rounded-2xl shadow-sm p-8">
          <Form form={form} layout="vertical" onFinish={onFinish} size="large">
            <Form.Item
              name="username"
              rules={[{ required: true, message: "请输入用户名" }]}
            >
              <Input
                prefix={<UserOutlined className="text-gray-300" />}
                placeholder="用户名"
              />
            </Form.Item>

            <Form.Item
              name="password"
              rules={[{ required: true, message: "请输入密码" }]}
            >
              <Input.Password
                prefix={<LockOutlined className="text-gray-300" />}
                placeholder="密码"
              />
            </Form.Item>

            <div className="flex justify-end -mt-2 mb-4">
              <a className="text-xs text-blue-500 hover:text-blue-600">
                忘记密码？
              </a>
            </div>

            <Form.Item className="mb-0">
              <Button
                type="primary"
                htmlType="submit"
                className="w-full"
                size="large"
                loading={loading}
              >
                登录
              </Button>
            </Form.Item>
          </Form>
        </div>

        <p className="text-center text-xs text-gray-300 mt-6">
          © 2025 报销管理系统
        </p>
        <p className="text-center text-sm text-gray-400 mt-3">
          没有账号？
          <a
            className="text-blue-500 hover:text-blue-600 ml-1 cursor-pointer"
            onClick={() => navigate("/register")}
          >
            立即注册
          </a>
        </p>
      </div>
    </div>
  );
}

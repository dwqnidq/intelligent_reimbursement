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
        refreshToken: res.refreshToken,
        user: res.user,
        permissions: res.permissions,
        menus: res.menus,
      });
      message.success("登录成功");
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
        (res.user.password_login_enabled === false ? "/password-setup" : null) ??
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
    <div
      className="min-h-screen flex items-center justify-center px-4 relative"
      style={{ background: "linear-gradient(135deg, #dbeafe 0%, #eff6ff 50%, #f0f9ff 100%)" }}
    >
      {/* 装饰圆 - 右上 */}
      <div
        style={{
          position: "absolute",
          top: "-100px",
          right: "-80px",
          width: "450px",
          height: "450px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(37,99,235,0.15) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />
      {/* 装饰圆 - 左下 */}
      <div
        style={{
          position: "absolute",
          bottom: "-120px",
          left: "-100px",
          width: "500px",
          height: "500px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(37,99,235,0.12) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div className="w-full max-w-sm relative" style={{ zIndex: 1 }}>
        {/* Logo */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center rounded-2xl mb-5"
            style={{
              width: 56,
              height: 56,
              background: "#2563eb",
              boxShadow: "0 8px 30px rgba(37, 99, 235, 0.3)",
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]" style={{ letterSpacing: "-0.02em" }}>
            报销管理系统
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-2">
            请使用手机号 / 邮箱登录
          </p>
        </div>

        {/* 表单卡片 */}
        <div
          className="bg-[var(--bg-card)] rounded-2xl p-8 border border-[var(--border-color)]"
          style={{ boxShadow: "0 4px 30px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04)" }}
        >
          <Form form={form} layout="vertical" onFinish={onFinish} size="large">
            <Form.Item
              name="username"
              rules={[{ required: true, message: "请输入手机号或邮箱" }]}
            >
              <Input
                prefix={<UserOutlined className="text-[var(--text-tertiary)]" />}
                placeholder="手机号或邮箱"
              />
            </Form.Item>

            <Form.Item
              name="password"
              rules={[{ required: true, message: "请输入密码" }]}
            >
              <Input.Password
                prefix={<LockOutlined className="text-[var(--text-tertiary)]" />}
                placeholder="密码"
              />
            </Form.Item>

            <div className="flex justify-end -mt-2 mb-5">
              <a className="text-xs text-[var(--color-primary)] hover:opacity-80 transition-opacity cursor-pointer font-medium">
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
                style={{ height: 44, fontSize: 15, fontWeight: 600 }}
              >
                登录
              </Button>
            </Form.Item>
          </Form>
        </div>

        <p className="text-center text-sm text-[var(--text-secondary)] mt-7">
          没有账号？
          <a
            className="text-[var(--color-primary)] hover:opacity-80 ml-1 cursor-pointer transition-opacity font-medium"
            onClick={() => navigate("/register")}
          >
            立即注册
          </a>
        </p>
        <p className="text-center text-sm text-[var(--text-secondary)] mt-3">
          <a
            className="text-[var(--color-primary)] hover:opacity-80 cursor-pointer transition-opacity font-medium"
            onClick={() => {
              const appId = import.meta.env.VITE_FEISHU_APP_ID;
              const redirectUri = import.meta.env.VITE_REDIRECT_URI;
              window.location.href = `https://accounts.feishu.cn/open-apis/authen/v1/authorize?app_id=${appId}&redirect_uri=${redirectUri}`;
            }}
          >
            使用飞书账号登录
          </a>
        </p>
        <p className="text-center text-xs text-[var(--text-tertiary)] mt-2">
          飞书首次登录后，可在个人中心设置密码再使用账号登录
        </p>
        <p className="text-center text-xs text-[var(--text-tertiary)] mt-8">
          &copy; 2025 报销管理系统
        </p>
      </div>
    </div>
  );
}

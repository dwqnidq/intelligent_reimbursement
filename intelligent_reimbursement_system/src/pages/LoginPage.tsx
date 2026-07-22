import { useState } from "react";
import { Form, Input, Button, message } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
import { useNavigate, useLocation } from "react-router-dom";
import { login } from "../api/user";
import type { LoginParams } from "../api/user";
import { useAuthStore } from "../store/useAuthStore";
import { resolvePostLoginPath } from "../utils/authNavigation";
import feishuLogo from "../assets/feishu-logo.png";

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
        roles: res.roles ?? [],
        menus: res.menus,
      });
      message.success("登录成功");
      const from =
        (location.state as { from?: Location })?.from?.pathname ?? null;
      navigate(resolvePostLoginPath(res.user, res.menus, from), {
        replace: true,
      });
    } catch {
      // 错误已由拦截器统一提示
    } finally {
      setLoading(false);
    }
  };

  const handleFeishuLogin = () => {
    const appId = import.meta.env.VITE_FEISHU_APP_ID;
    const redirectUri = import.meta.env.VITE_REDIRECT_URI;
    window.location.href = `https://accounts.feishu.cn/open-apis/authen/v1/authorize?app_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 relative"
      style={{
        background:
          "radial-gradient(1200px 600px at 10% -10%, #dbeafe 0%, transparent 55%), radial-gradient(900px 500px at 100% 0%, #e0f2fe 0%, transparent 50%), linear-gradient(180deg, #f1f5f9 0%, #eef2f7 100%)",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "-100px",
          right: "-80px",
          width: "450px",
          height: "450px",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(29, 78, 216,0.18) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "-120px",
          left: "-100px",
          width: "500px",
          height: "500px",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(29, 78, 216,0.14) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div className="w-full max-w-sm relative" style={{ zIndex: 1 }}>
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center rounded-2xl mb-5"
            style={{
              width: 56,
              height: 56,
              background: "linear-gradient(145deg, #2563eb, #1d4ed8)",
              boxShadow: "0 8px 30px rgba(29, 78, 216, 0.3)",
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
          <h1
            className="text-xl font-bold text-[var(--text-primary)]"
            style={{ letterSpacing: "-0.02em" }}
          >
            报销管理系统
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-2">
            请使用手机号 / 邮箱登录
          </p>
        </div>

        <div
          className="bg-[var(--bg-card)] rounded-2xl p-8 border border-[var(--border-color)]"
          style={{
            boxShadow:
              "0 4px 30px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04)",
          }}
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

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-[var(--border-color)]" />
            <span className="text-xs text-[var(--text-tertiary)]">或</span>
            <div className="flex-1 h-px bg-[var(--border-color)]" />
          </div>

          <button
            type="button"
            onClick={handleFeishuLogin}
            className="w-full flex items-center justify-center gap-2.5 rounded-xl border border-[var(--border-color)] bg-white hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
            style={{ height: 44 }}
          >
            <img
              src={feishuLogo}
              alt="飞书"
              width={22}
              height={22}
              style={{ display: "block" }}
            />
            <span className="text-[15px] font-semibold text-[var(--text-primary)]">
              使用飞书账号登录
            </span>
          </button>
        </div>

        <p className="text-center text-xs text-[var(--text-tertiary)] mt-4">
          飞书首次登录后，可在个人中心设置密码再使用账号登录
        </p>
        <p className="text-center text-xs text-[var(--text-tertiary)] mt-8">
          &copy; 2025 报销管理系统
        </p>
      </div>
    </div>
  );
}

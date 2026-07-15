import { useEffect, useState } from "react";
import { Form, Input, Button, message } from "antd";
import { LockOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { setupPassword } from "../api/user";
import { useAuthStore } from "../store/useAuthStore";
import { resolvePostLoginPath } from "../utils/authNavigation";

export default function PasswordSetupPage() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { user, setAuth, token, refreshToken, permissions, menus } = useAuthStore();

  useEffect(() => {
    if (!user) {
      navigate("/login", { replace: true });
    }
  }, [navigate, user]);

  if (!user) return null;

  const onFinish = async (values: {
    new_password: string;
    confirm_password: string;
  }) => {
    if (values.new_password !== values.confirm_password) {
      message.error("两次输入的新密码不一致");
      return;
    }
    setLoading(true);
    try {
      await setupPassword({ new_password: values.new_password });
      setAuth({
        token,
        refreshToken,
        user: {
          ...user,
          password_login_enabled: true,
        },
        permissions,
        menus,
      });
      message.success("设置成功");
      navigate(resolvePostLoginPath({ ...user, password_login_enabled: true }, menus), {
        replace: true,
      });
    } catch {
      // 错误提示由拦截器处理
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 relative"
      style={{
        background:
          "radial-gradient(1200px 600px at 10% -10%, #d1fae5 0%, transparent 55%), radial-gradient(900px 500px at 100% 0%, #e0f2fe 0%, transparent 50%), linear-gradient(180deg, #f1f5f9 0%, #eef2f7 100%)",
      }}
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

      <div className="w-full max-w-sm relative" style={{ zIndex: 1 }}>
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center rounded-2xl mb-5"
            style={{
              width: 56, height: 56,
              background: "linear-gradient(145deg, #0d9488, #0f766e)",
              boxShadow: "0 8px 30px rgba(15, 118, 110, 0.3)",
            }}
          >
            <LockOutlined className="text-white text-xl" />
          </div>
          <h2 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">
            首次设置登录密码
          </h2>
          <p className="text-sm text-[var(--text-secondary)] mt-2">
            设置后可使用用户名/邮箱 + 密码登录
          </p>
        </div>

        <div
          className="bg-[var(--bg-card)] rounded-2xl p-8 border border-[var(--border-color)]"
          style={{ boxShadow: "0 4px 30px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04)" }}
        >
          <Form form={form} layout="vertical" onFinish={onFinish}>
            <Form.Item
              label="新密码"
              name="new_password"
              rules={[
                { required: true, message: "请输入新密码" },
                { min: 6, message: "密码至少6位" },
              ]}
            >
              <Input.Password
                prefix={<LockOutlined className="text-[var(--text-tertiary)]" />}
                placeholder="请输入新密码"
              />
            </Form.Item>
            <Form.Item
              label="确认新密码"
              name="confirm_password"
              rules={[{ required: true, message: "请再次输入新密码" }]}
            >
              <Input.Password
                prefix={<LockOutlined className="text-[var(--text-tertiary)]" />}
                placeholder="请再次输入新密码"
              />
            </Form.Item>
            <Form.Item className="mb-0">
              <Button type="primary" htmlType="submit" className="w-full !h-11 !text-[15px] !font-semibold" loading={loading}>
                保存密码
              </Button>
            </Form.Item>
          </Form>
        </div>
      </div>
    </div>
  );
}

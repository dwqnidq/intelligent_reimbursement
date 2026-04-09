import { useEffect, useState } from "react";
import { Card, Form, Input, Button, message } from "antd";
import { LockOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { setupPassword } from "../api/user";
import { useAuthStore } from "../store/useAuthStore";

export default function PasswordSetupPage() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { user, setAuth, token, permissions, menus } = useAuthStore();

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
        user: {
          ...user,
          password_login_enabled: true,
        },
        permissions,
        menus,
      });
      message.success("设置成功，请使用新密码登录");
      navigate("/", { replace: true });
    } catch {
      // 错误提示由拦截器处理
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <Card className="w-full max-w-md rounded-2xl shadow-sm">
        <h2 className="text-lg font-semibold text-center mb-2">首次设置登录密码</h2>
        <p className="text-sm text-gray-400 text-center mb-6">
          设置后可使用用户名/邮箱 + 密码登录
        </p>
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
              prefix={<LockOutlined className="text-gray-300" />}
              placeholder="请输入新密码"
            />
          </Form.Item>
          <Form.Item
            label="确认新密码"
            name="confirm_password"
            rules={[{ required: true, message: "请再次输入新密码" }]}
          >
            <Input.Password
              prefix={<LockOutlined className="text-gray-300" />}
              placeholder="请再次输入新密码"
            />
          </Form.Item>
          <Form.Item className="mb-0">
            <Button type="primary" htmlType="submit" className="w-full" loading={loading}>
              保存密码
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}

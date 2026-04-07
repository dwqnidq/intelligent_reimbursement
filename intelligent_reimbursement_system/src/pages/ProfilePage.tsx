import { useState } from "react";
import {
  Card,
  Avatar,
  Button,
  Form,
  Input,
  Upload,
  message,
  Divider,
} from "antd";
import { UserOutlined, CameraOutlined, LockOutlined } from "@ant-design/icons";
import type { UploadProps } from "antd";
import { useAuthStore } from "../store/useAuthStore";
import { updateAvatar, changePassword } from "../api/user";

export default function ProfilePage() {
  const { user, setAuth, token, permissions, menus } = useAuthStore();
  const [pwdForm] = Form.useForm();
  const [pwdLoading, setPwdLoading] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);

  const uploadProps: UploadProps = {
    showUploadList: false,
    accept: "image/*",
    beforeUpload: async (file) => {
      const isImage = file.type.startsWith("image/");
      if (!isImage) {
        message.error("只能上传图片文件");
        return false;
      }
      const isLt2M = file.size / 1024 / 1024 < 2;
      if (!isLt2M) {
        message.error("图片大小不能超过 2MB");
        return false;
      }

      setAvatarLoading(true);
      try {
        const res = await updateAvatar(file);
        // 更新 store 里的 avatar
        setAuth({
          token,
          user: { ...user!, avatar: res.avatar },
          permissions,
          menus,
        });
        message.success("头像已更新");
      } catch {
        // 拦截器统一提示
      } finally {
        setAvatarLoading(false);
      }
      return false;
    },
  };

  const onChangePwd = async (values: {
    old_password: string;
    new_password: string;
    confirm_password: string;
  }) => {
    if (values.new_password !== values.confirm_password) {
      message.error("两次输入的新密码不一致");
      return;
    }
    setPwdLoading(true);
    try {
      await changePassword({
        old_password: values.old_password,
        new_password: values.new_password,
      });
      message.success("密码修改成功，请重新登录");
      pwdForm.resetFields();
    } catch {
      // 拦截器统一提示
    } finally {
      setPwdLoading(false);
    }
  };

  return (
    <div className="w-full flex flex-col flex-1">
      <Card className="rounded-2xl shadow-sm w-full flex flex-col flex-1">
        <h2 className="text-base md:text-lg font-semibold mb-6 text-center">
          个人信息
        </h2>

        <div className="flex flex-col flex-1 items-center">
          <div className="w-full max-w-md">
            {/* 头像 */}
            <div className="flex flex-col items-center mb-8">
              <div className="relative inline-block">
                <Avatar
                  size={90}
                  src={user?.avatar || undefined}
                  icon={!user?.avatar && <UserOutlined />}
                  className="bg-blue-500"
                />
                <Upload {...uploadProps}>
                  <button
                    className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center shadow-md transition-colors border-2 border-white"
                    type="button"
                    disabled={avatarLoading}
                  >
                    <CameraOutlined style={{ fontSize: 13 }} />
                  </button>
                </Upload>
              </div>
              <p className="text-xs text-gray-400 mt-2">点击相机图标更换头像</p>
            </div>

            {/* 基本信息展示 */}
            <div className="mb-6 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">昵称</span>
                <span className="font-medium">{user?.username ?? "-"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">邮箱</span>
                <span className="font-medium">{user?.email ?? "-"}</span>
              </div>
            </div>

            <Divider />

            {/* 修改密码 */}
            <p className="text-sm font-medium mb-4 flex items-center gap-2">
              <LockOutlined />
              修改密码
            </p>
            <Form form={pwdForm} layout="vertical" onFinish={onChangePwd}>
              <Form.Item
                label="旧密码"
                name="old_password"
                rules={[{ required: true, message: "请输入旧密码" }]}
              >
                <Input.Password placeholder="请输入当前密码" />
              </Form.Item>
              <Form.Item
                label="新密码"
                name="new_password"
                rules={[
                  { required: true, message: "请输入新密码" },
                  { min: 6, message: "密码至少6位" },
                ]}
              >
                <Input.Password placeholder="请输入新密码" />
              </Form.Item>
              <Form.Item
                label="确认新密码"
                name="confirm_password"
                rules={[{ required: true, message: "请再次输入新密码" }]}
              >
                <Input.Password placeholder="请再次输入新密码" />
              </Form.Item>
              <Form.Item className="mb-0">
                <Button
                  htmlType="submit"
                  className="w-full"
                  loading={pwdLoading}
                >
                  修改密码
                </Button>
              </Form.Item>
            </Form>
          </div>
        </div>
      </Card>
    </div>
  );
}

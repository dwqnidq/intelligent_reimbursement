import { useState, useEffect } from "react";
import {
  Card,
  Avatar,
  Button,
  Form,
  Input,
  Upload,
  message,
  Divider,
  Select,
} from "antd";
import { UserOutlined, CameraOutlined, LockOutlined, IdcardOutlined, BankOutlined } from "@ant-design/icons";
import type { UploadProps } from "antd";
import { useAuthStore } from "../store/useAuthStore";
import { updateAvatar, changePassword, updateProfile, updateProfileSetup } from "../api/user";
import { getCompanyNameOptions } from "../api/company";
import type { CompanyNameOption } from "../api/company";

export default function ProfilePage() {
  const { user, setAuth, token, refreshToken, permissions, roles, menus } = useAuthStore();
  const [pwdForm] = Form.useForm();
  const [basicForm] = Form.useForm();
  const [profileForm] = Form.useForm();
  const [pwdLoading, setPwdLoading] = useState(false);
  const [basicLoading, setBasicLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);

  const [companyOptions, setCompanyOptions] = useState<CompanyNameOption[]>([]);

  useEffect(() => {
    getCompanyNameOptions()
      .then((list) => setCompanyOptions(Array.isArray(list) ? list : []))
      .catch(() => setCompanyOptions([]));
  }, []);

  useEffect(() => {
    basicForm.setFieldsValue({
      username: user?.username ?? "",
      email: user?.email ?? "",
    });
    profileForm.setFieldsValue({
      company_id: user?.company_id || undefined,
      payment_account: user?.payment_account ?? "",
    });
  }, [
    basicForm,
    profileForm,
    user?.username,
    user?.email,
    user?.company_id,
    user?.payment_account,
  ]);

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
        setAuth({
          token,
          refreshToken,
          user: { ...user!, avatar: res.avatar },
          permissions,
          roles,
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

  const onUpdateBasicInfo = async (values: { username: string; email: string }) => {
    setBasicLoading(true);
    try {
      const res = await updateProfile({
        username: values.username.trim(),
        email: values.email.trim(),
      });
      setAuth({
        token,
        refreshToken,
        user: res.user,
        permissions,
        roles,
        menus,
      });
      message.success("基本信息已更新");
    } catch {
      // 拦截器统一提示
    } finally {
      setBasicLoading(false);
    }
  };

  const onUpdateProfile = async (values: {
    company_id: string;
    payment_account: string;
  }) => {
    setProfileLoading(true);
    try {
      const res = await updateProfileSetup({
        company_id: values.company_id,
        payment_account: values.payment_account.trim(),
      });
      setAuth({
        token,
        refreshToken,
        user: res.user,
        permissions,
        roles,
        menus,
      });
      message.success("公司与收款账户已更新");
    } catch {
      // 拦截器统一提示
    } finally {
      setProfileLoading(false);
    }
  };

  return (
    <div className="w-full flex flex-col flex-1">
      <Card className="w-full flex flex-col flex-1">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--color-primary-bg)]">
            <IdcardOutlined className="text-[var(--color-primary)] text-sm" />
          </div>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">个人信息</h2>
        </div>

        <div className="flex flex-col flex-1 items-center">
          <div className="w-full max-w-md">
            {/* 头像 */}
            <div className="flex flex-col items-center mb-8">
              <div className="relative inline-block">
                <Avatar
                  size={96}
                  src={user?.avatar || undefined}
                  icon={!user?.avatar && <UserOutlined />}
                  style={{ background: "var(--color-primary)" }}
                />
                <Upload {...uploadProps}>
                  <button
                    className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white flex items-center justify-center shadow-md transition-colors border-2 border-white"
                    type="button"
                    disabled={avatarLoading}
                  >
                    <CameraOutlined style={{ fontSize: 13 }} />
                  </button>
                </Upload>
              </div>
              <p className="text-xs text-[var(--text-tertiary)] mt-2">点击相机图标更换头像</p>
            </div>

            <div className="mb-6">
              <div className="flex items-center gap-2 mb-4">
                <UserOutlined className="text-[var(--color-primary)]" />
                <span className="text-sm font-medium text-[var(--text-primary)]">基本信息</span>
              </div>
              <Form
                form={basicForm}
                layout="vertical"
                initialValues={{
                  username: user?.username ?? "",
                  email: user?.email ?? "",
                }}
                onFinish={onUpdateBasicInfo}
              >
                <Form.Item
                  label="昵称"
                  name="username"
                  rules={[{ required: true, message: "请输入昵称" }]}
                >
                  <Input placeholder="请输入昵称" maxLength={50} />
                </Form.Item>
                <Form.Item
                  label="邮箱"
                  name="email"
                  rules={[
                    { required: true, message: "请输入邮箱" },
                    { type: "email", message: "请输入有效的邮箱地址" },
                  ]}
                >
                  <Input placeholder="请输入邮箱" />
                </Form.Item>
                <Form.Item className="mb-0">
                  <Button type="primary" htmlType="submit" loading={basicLoading}>
                    保存基本信息
                  </Button>
                </Form.Item>
              </Form>
            </div>

            <Divider />

            <div className="mb-6">
              <div className="flex items-center gap-2 mb-4">
                <BankOutlined className="text-[var(--color-primary)]" />
                <span className="text-sm font-medium text-[var(--text-primary)]">公司与收款账户</span>
              </div>
              <Form
                form={profileForm}
                layout="vertical"
                initialValues={{
                  company_id: user?.company_id || undefined,
                  payment_account: user?.payment_account ?? "",
                }}
                onFinish={onUpdateProfile}
              >
                <Form.Item
                  label="所属公司"
                  name="company_id"
                  rules={[{ required: true, message: "请选择所属公司" }]}
                >
                  <Select
                    placeholder="请选择公司"
                    options={companyOptions.map((item) => ({
                      label: item.name,
                      value: item._id,
                    }))}
                    showSearch
                    optionFilterProp="label"
                  />
                </Form.Item>
                <Form.Item
                  label="收款账户"
                  name="payment_account"
                  rules={[{ required: true, message: "请输入收款账户" }]}
                >
                  <Input placeholder="银行卡号、支付宝账号等" />
                </Form.Item>
                <Form.Item className="mb-0">
                  <Button type="primary" htmlType="submit" loading={profileLoading}>
                    保存资料
                  </Button>
                </Form.Item>
              </Form>
            </div>

            <Divider />

            {/* 修改密码 */}
            <p className="text-sm font-medium mb-4 flex items-center gap-2 text-[var(--text-primary)]">
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
                  type="primary"
                  htmlType="submit"
                  className="w-full !h-10 !font-semibold"
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

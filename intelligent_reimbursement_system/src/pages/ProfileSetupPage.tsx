import { useEffect, useState } from "react";
import { Form, Input, Button, message, Select } from "antd";
import { BankOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { updateProfileSetup } from "../api/user";
import type { MenuItem } from "../api/user";
import { getCompanyNameOptions } from "../api/company";
import type { CompanyNameOption } from "../api/company";
import { useAuthStore } from "../store/useAuthStore";

function findFirstPath(menus: MenuItem[]): string | null {
  for (const m of menus) {
    if (m.path) return m.path;
    if (m.children?.length) {
      const found = findFirstPath(m.children);
      if (found) return found;
    }
  }
  return null;
}

export default function ProfileSetupPage() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [companyOptions, setCompanyOptions] = useState<CompanyNameOption[]>([]);
  const navigate = useNavigate();
  const { user, setAuth, token, refreshToken, permissions, menus } =
    useAuthStore();

  useEffect(() => {
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }
    form.setFieldsValue({
      company_id: user.company_id || undefined,
      payment_account: user.payment_account ?? "",
    });
  }, [form, navigate, user]);

  useEffect(() => {
    setCompanyLoading(true);
    getCompanyNameOptions()
      .then((list) => setCompanyOptions(Array.isArray(list) ? list : []))
      .catch(() => setCompanyOptions([]))
      .finally(() => setCompanyLoading(false));
  }, []);

  if (!user) return null;

  const onFinish = async (values: {
    company_id: string;
    payment_account: string;
  }) => {
    const account = values.payment_account.trim();
    if (!values.company_id) {
      message.error("请选择所属公司");
      return;
    }
    if (!account) {
      message.error("请输入收款账户");
      return;
    }
    setLoading(true);
    try {
      const res = await updateProfileSetup({
        company_id: values.company_id,
        payment_account: account,
      });
      setAuth({
        token,
        refreshToken,
        user: res.user,
        permissions,
        menus,
      });
      message.success("资料已保存");
      navigate(findFirstPath(menus) ?? "/", { replace: true });
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
      <div className="w-full max-w-sm relative" style={{ zIndex: 1 }}>
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center rounded-2xl mb-5"
            style={{
              width: 56,
              height: 56,
              background: "linear-gradient(145deg, #0d9488, #0f766e)",
              boxShadow: "0 8px 30px rgba(15, 118, 110, 0.3)",
            }}
          >
            <BankOutlined className="text-white text-xl" />
          </div>
          <h2 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">
            完善报销资料
          </h2>
          <p className="text-sm text-[var(--text-secondary)] mt-2">
            提交报销前需选择所属公司并登记收款账户
          </p>
        </div>

        <div
          className="bg-[var(--bg-card)] rounded-2xl p-8 border border-[var(--border-color)]"
          style={{
            boxShadow:
              "0 4px 30px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04)",
          }}
        >
          <Form form={form} layout="vertical" onFinish={onFinish}>
            <Form.Item
              label="所属公司"
              name="company_id"
              rules={[{ required: true, message: "请选择所属公司" }]}
            >
              <Select
                placeholder="请选择公司"
                loading={companyLoading}
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
              extra="可填写银行卡号、支付宝账号等收款信息"
            >
              <Input placeholder="请输入收款账户" />
            </Form.Item>
            <Form.Item className="mb-0">
              <Button
                type="primary"
                htmlType="submit"
                className="w-full !h-11 !text-[15px] !font-semibold"
                loading={loading}
                disabled={companyOptions.length === 0}
              >
                保存并继续
              </Button>
            </Form.Item>
          </Form>
        </div>
      </div>
    </div>
  );
}

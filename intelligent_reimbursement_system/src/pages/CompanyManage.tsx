import { useState, useEffect } from "react";
import {
  Card,
  Table,
  Modal,
  Form,
  Button,
  Input,
  message,
  Popconfirm,
} from "antd";
import { PlusOutlined, DeleteOutlined, BankOutlined, EditOutlined } from "@ant-design/icons";
import {
  getCompanies,
  createCompany,
  updateCompany,
  deleteCompany,
} from "../api/company";
import type { Company } from "../api/company";

export default function CompanyManage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const fetchCompanies = async () => {
    setLoading(true);
    try {
      const res = await getCompanies();
      setCompanies(Array.isArray(res) ? res : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  const openCreateModal = () => {
    setEditingCompany(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEditModal = (record: Company) => {
    setEditingCompany(record);
    form.setFieldsValue({ name: record.name });
    setModalOpen(true);
  };

  const handleSubmit = async (values: { name: string }) => {
    const name = values.name.trim();
    if (!name) {
      message.error("请输入公司名称");
      return;
    }
    setSubmitting(true);
    try {
      if (editingCompany) {
        await updateCompany(editingCompany._id, { name });
        message.success("公司已更新");
      } else {
        await createCompany({ name });
        message.success("公司已创建");
      }
      setModalOpen(false);
      fetchCompanies();
    } catch {
      // 拦截器统一提示
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteCompany(id);
      message.success("公司已删除");
      fetchCompanies();
    } catch {
      // 拦截器统一提示
    }
  };

  return (
    <div className="w-full flex flex-col flex-1">
      <Card className="w-full flex flex-col flex-1">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--color-primary-bg)]">
              <BankOutlined className="text-[var(--color-primary)] text-sm" />
            </div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">公司管理</h2>
          </div>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
            新增公司
          </Button>
        </div>

        <Table
          rowKey="_id"
          loading={loading}
          dataSource={companies}
          pagination={false}
          columns={[
            {
              title: "公司名称",
              dataIndex: "name",
              key: "name",
            },
            {
              title: "操作",
              key: "action",
              width: 160,
              render: (_, record) => (
                <div className="flex gap-2">
                  <Button
                    type="link"
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => openEditModal(record)}
                  >
                    编辑
                  </Button>
                  <Popconfirm
                    title="确定删除该公司？"
                    description="若仍有用户归属该公司将无法删除"
                    onConfirm={() => handleDelete(record._id)}
                  >
                    <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                      删除
                    </Button>
                  </Popconfirm>
                </div>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title={editingCompany ? "编辑公司" : "新增公司"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            label="公司名称"
            name="name"
            rules={[{ required: true, message: "请输入公司名称" }]}
          >
            <Input placeholder="请输入公司全称" />
          </Form.Item>
          <Form.Item className="mb-0">
            <Button type="primary" htmlType="submit" loading={submitting} block>
              保存
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

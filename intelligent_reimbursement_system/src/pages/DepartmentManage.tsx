import { useState, useEffect, useCallback } from "react";
import {
  Card,
  Table,
  Modal,
  Form,
  Switch,
  Button,
  Input,
  InputNumber,
  Select,
  message,
  Popconfirm,
} from "antd";
import { PlusOutlined, DeleteOutlined, ApartmentOutlined, EditOutlined } from "@ant-design/icons";
import {
  getDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
} from "../api/department";
import type { Department, CreateDepartmentParams } from "../api/department";
import { getEmployees } from "../api/employee";
import type { Employee } from "../api/employee";

const { TextArea } = Input;

export default function DepartmentManage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  // 员工搜索相关
  const [employeeOptions, setEmployeeOptions] = useState<Employee[]>([]);
  const [employeeLoading, setEmployeeLoading] = useState(false);

  const fetchDepartments = async () => {
    setLoading(true);
    try {
      const res = await getDepartments();
      const list = Array.isArray(res)
        ? res
        : ((res as unknown as { data?: Department[] }).data ?? []);
      setDepartments(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDepartments();
  }, []);

  // 搜索员工
  const handleEmployeeSearch = useCallback(async (keyword?: string) => {
    setEmployeeLoading(true);
    try {
      const res = await getEmployees({ name: keyword || undefined, page: 1, page_size: 50 });
      const list = res?.list ?? [];
      setEmployeeOptions(list);
    } catch {
      // 拦截器统一提示
    } finally {
      setEmployeeLoading(false);
    }
  }, []);

  // 打开新增弹窗
  const openCreateModal = () => {
    setEditingDept(null);
    form.resetFields();
    form.setFieldsValue({ enabled: true, sort: 0 });
    setEmployeeOptions([]);
    setModalOpen(true);
  };

  // 打开编辑弹窗
  const openEditModal = (record: Department) => {
    setEditingDept(record);
    form.resetFields();
    form.setFieldsValue({
      name: record.name,
      code: record.code,
      manager_id: record.manager_id?._id,
      description: record.description ?? "",
      enabled: record.status === 1,
      sort: record.sort,
    });
    // 如果有负责人，预填到选项中
    if (record.manager_id) {
      setEmployeeOptions([
        {
          _id: record.manager_id._id,
          employee_no: "",
          name: record.manager_id.name,
          gender: 0,
          position: record.manager_id.position,
          avatar: record.manager_id.avatar,
          status: 1,
        },
      ]);
    } else {
      setEmployeeOptions([]);
    }
    setModalOpen(true);
  };

  // 提交表单（新增/编辑）
  const handleSubmit = async (values: {
    name: string;
    code: string;
    manager_id?: string;
    description?: string;
    enabled: boolean;
    sort: number;
  }) => {
    setSubmitting(true);
    try {
      const params: CreateDepartmentParams = {
        name: values.name.trim(),
        code: values.code.trim(),
        manager_id: values.manager_id || undefined,
        description: values.description?.trim() || undefined,
        status: values.enabled ? 1 : 0,
        sort: values.sort,
      };
      if (editingDept) {
        await updateDepartment(editingDept._id, params);
        message.success("部门更新成功");
      } else {
        await createDepartment(params);
        message.success("部门创建成功");
      }
      setModalOpen(false);
      form.resetFields();
      setEditingDept(null);
      fetchDepartments();
    } catch {
      // 拦截器统一提示
    } finally {
      setSubmitting(false);
    }
  };

  // 切换状态
  const handleToggleStatus = async (record: Department) => {
    try {
      await updateDepartment(record._id, { status: record.status === 1 ? 0 : 1 });
      message.success("状态已更新");
      fetchDepartments();
    } catch {
      // 拦截器统一提示
    }
  };

  // 删除部门
  const handleDelete = async (id: string) => {
    try {
      await deleteDepartment(id);
      message.success("部门已删除");
      fetchDepartments();
    } catch {
      // 拦截器统一提示
    }
  };

  const columns = [
    {
      title: "部门名称",
      dataIndex: "name",
      key: "name",
    },
    {
      title: "部门编码",
      dataIndex: "code",
      key: "code",
    },
    {
      title: "负责人",
      key: "manager",
      render: (_: unknown, record: Department) =>
        record.manager_id?.name ?? <span className="text-[var(--text-tertiary)]">未设置</span>,
    },
    {
      title: "描述",
      dataIndex: "description",
      key: "description",
      ellipsis: true,
      render: (v: string) => v || <span className="text-[var(--text-tertiary)]">-</span>,
    },
    {
      title: "状态",
      key: "status",
      width: 100,
      render: (_: unknown, record: Department) => (
        <Switch
          checked={record.status === 1}
          checkedChildren="启用"
          unCheckedChildren="禁用"
          onChange={() => handleToggleStatus(record)}
        />
      ),
    },
    {
      title: "操作",
      key: "actions",
      width: 150,
      render: (_: unknown, record: Department) => (
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
            title="确认删除该部门？"
            description="删除后不可恢复"
            okText="确认删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDelete(record._id)}
          >
            <Button type="text" danger size="small" icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </div>
      ),
    },
  ];

  return (
    <div className="w-full flex flex-col flex-1 min-h-0">
      <div className="w-full mx-auto space-y-6 flex-1 min-h-0">
        <Card
          title={
            <span className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-[var(--color-primary-bg)]">
                <ApartmentOutlined className="text-[var(--color-primary)] text-xs" />
              </div>
              部门管理
            </span>
          }
          extra={
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
              新增部门
            </Button>
          }
        >
          <Table
            dataSource={departments}
            rowKey="_id"
            loading={loading}
            columns={columns}
            pagination={false}
            size="middle"
            locale={{ emptyText: "暂无部门数据" }}
          />
        </Card>

        <Modal
          title={editingDept ? "编辑部门" : "新增部门"}
          open={modalOpen}
          onCancel={() => {
            setModalOpen(false);
            form.resetFields();
            setEditingDept(null);
          }}
          footer={null}
          destroyOnClose
        >
          <Form form={form} layout="vertical" onFinish={handleSubmit}>
            <Form.Item
              label="部门名称"
              name="name"
              rules={[{ required: true, message: "请输入部门名称" }]}
            >
              <Input placeholder="请输入部门名称" />
            </Form.Item>

            <Form.Item
              label="部门编码"
              name="code"
              rules={[{ required: true, message: "请输入部门编码" }]}
            >
              <Input placeholder="请输入部门编码" />
            </Form.Item>

            <Form.Item label="负责人" name="manager_id">
              <Select
                showSearch
                placeholder="搜索或点击选择负责人"
                filterOption={false}
                onSearch={handleEmployeeSearch}
                onDropdownVisibleChange={(open) => {
                  if (open && employeeOptions.length === 0) handleEmployeeSearch();
                }}
                loading={employeeLoading}
                allowClear
                options={employeeOptions.map((emp) => ({
                  label: (
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{emp.name}</span>
                      {emp.position && <span className="text-[var(--text-tertiary)] text-xs">{emp.position}</span>}
                      {emp.employee_no && <span className="text-[var(--text-tertiary)] text-xs">({emp.employee_no})</span>}
                    </div>
                  ),
                  value: emp._id,
                }))}
              />
            </Form.Item>

            <Form.Item label="描述" name="description">
              <TextArea rows={3} placeholder="请输入部门描述" />
            </Form.Item>

            <div className="grid grid-cols-2 gap-x-5">
              <Form.Item label="状态" name="enabled" valuePropName="checked">
                <Switch checkedChildren="启用" unCheckedChildren="禁用" />
              </Form.Item>
              <Form.Item label="排序" name="sort">
                <InputNumber className="w-full" min={0} placeholder="数值越小越靠前" />
              </Form.Item>
            </div>

            <div className="flex gap-3 justify-end mt-2">
              <Button onClick={() => setModalOpen(false)}>取消</Button>
              <Button type="primary" htmlType="submit" loading={submitting}>
                {editingDept ? "保存" : "创建"}
              </Button>
            </div>
          </Form>
        </Modal>
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  Table,
  Modal,
  Form,
  Switch,
  Button,
  Input,
  Select,
  Radio,
  Tag,
  message,
  Popconfirm,
} from "antd";
import { PlusOutlined, DeleteOutlined, TeamOutlined, EditOutlined } from "@ant-design/icons";
import {
  getEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
} from "../api/employee";
import type { Employee, CreateEmployeeParams } from "../api/employee";
import { getDepartments } from "../api/department";
import type { Department } from "../api/department";

const genderMap: Record<number, { label: string; color: string }> = {
  0: { label: "未知", color: "default" },
  1: { label: "男", color: "blue" },
  2: { label: "女", color: "magenta" },
};

export default function EmployeeManage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(false);

  // 搜索与筛选
  const [searchName, setSearchName] = useState("");
  const [filterDeptId, setFilterDeptId] = useState<string | undefined>(undefined);
  const [departments, setDepartments] = useState<Department[]>([]);

  // 弹窗
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  // 加载部门列表（用于筛选下拉和表单选择）
  const fetchDepartments = useCallback(async () => {
    try {
      const res = await getDepartments({ status: 1 });
      const list = Array.isArray(res)
        ? res
        : ((res as unknown as { data?: Department[] }).data ?? []);
      setDepartments(list);
    } catch {
      // 拦截器统一提示
    }
  }, []);

  // 加载员工列表
  const fetchEmployees = useCallback(
    async (p?: number, ps?: number) => {
      setLoading(true);
      try {
        const currentPage = p ?? page;
        const currentPageSize = ps ?? pageSize;
        const res = await getEmployees({
          name: searchName || undefined,
          dept_id: filterDeptId || undefined,
          page: currentPage,
          page_size: currentPageSize,
        });
        setEmployees(res?.list ?? []);
        setTotal(res?.total ?? 0);
      } catch {
        // 拦截器统一提示
      } finally {
        setLoading(false);
      }
    },
    [searchName, filterDeptId, page, pageSize],
  );

  useEffect(() => {
    fetchDepartments();
  }, [fetchDepartments]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  // 搜索
  const handleSearch = (value: string) => {
    setSearchName(value);
    setPage(1);
  };

  // 部门筛选
  const handleDeptFilter = (value: string | undefined) => {
    setFilterDeptId(value);
    setPage(1);
  };

  // 翻页
  const handlePageChange = (newPage: number, newPageSize: number) => {
    setPage(newPage);
    setPageSize(newPageSize);
  };

  // 打开新增弹窗
  const openCreateModal = () => {
    setEditingEmployee(null);
    form.resetFields();
    form.setFieldsValue({ gender: 0, status: 1 });
    setModalOpen(true);
  };

  // 打开编辑弹窗
  const openEditModal = (record: Employee) => {
    setEditingEmployee(record);
    form.resetFields();
    form.setFieldsValue({
      employee_no: record.employee_no,
      name: record.name,
      gender: record.gender,
      dept_id: record.dept_id?._id,
      position: record.position ?? "",
      phone: record.phone ?? "",
      status: record.status,
    });
    setModalOpen(true);
  };

  // 提交表单
  const handleSubmit = async (values: {
    employee_no: string;
    name: string;
    gender: number;
    dept_id?: string;
    position?: string;
    phone?: string;
    status: number;
  }) => {
    setSubmitting(true);
    try {
      const params: CreateEmployeeParams = {
        employee_no: values.employee_no.trim(),
        name: values.name.trim(),
        gender: values.gender,
        dept_id: values.dept_id || undefined,
        position: values.position?.trim() || undefined,
        phone: values.phone?.trim() || undefined,
        status: values.status,
      };
      if (editingEmployee) {
        await updateEmployee(editingEmployee._id, params);
        message.success("员工更新成功");
      } else {
        await createEmployee(params);
        message.success("员工创建成功");
      }
      setModalOpen(false);
      form.resetFields();
      setEditingEmployee(null);
      fetchEmployees();
    } catch {
      // 拦截器统一提示
    } finally {
      setSubmitting(false);
    }
  };

  // 切换状态
  const handleToggleStatus = async (record: Employee) => {
    try {
      await updateEmployee(record._id, { status: record.status === 1 ? 0 : 1 });
      message.success("状态已更新");
      fetchEmployees();
    } catch {
      // 拦截器统一提示
    }
  };

  // 删除员工
  const handleDelete = async (id: string) => {
    try {
      await deleteEmployee(id);
      message.success("员工已删除");
      fetchEmployees();
    } catch {
      // 拦截器统一提示
    }
  };

  const columns = [
    {
      title: "工号",
      dataIndex: "employee_no",
      key: "employee_no",
    },
    {
      title: "姓名",
      dataIndex: "name",
      key: "name",
    },
    {
      title: "性别",
      key: "gender",
      width: 80,
      render: (_: unknown, record: Employee) => {
        const g = genderMap[record.gender] ?? genderMap[0];
        return <Tag color={g.color}>{g.label}</Tag>;
      },
    },
    {
      title: "部门",
      key: "department",
      render: (_: unknown, record: Employee) =>
        record.dept_id?.name ?? <span className="text-[var(--text-tertiary)]">未分配</span>,
    },
    {
      title: "职位",
      dataIndex: "position",
      key: "position",
      render: (v: string) => v || <span className="text-[var(--text-tertiary)]">-</span>,
    },
    {
      title: "手机号",
      dataIndex: "phone",
      key: "phone",
      render: (v: string) => v || <span className="text-[var(--text-tertiary)]">-</span>,
    },
    {
      title: "状态",
      key: "status",
      width: 100,
      render: (_: unknown, record: Employee) => (
        <Switch
          checked={record.status === 1}
          checkedChildren="在职"
          unCheckedChildren="离职"
          onChange={() => handleToggleStatus(record)}
        />
      ),
    },
    {
      title: "操作",
      key: "actions",
      width: 150,
      render: (_: unknown, record: Employee) => (
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
            title="确认删除该员工？"
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
                <TeamOutlined className="text-[var(--color-primary)] text-xs" />
              </div>
              员工管理
            </span>
          }
          extra={
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
              新增员工
            </Button>
          }
        >
          <div className="flex gap-3 mb-4">
            <Input.Search
              placeholder="搜索员工姓名"
              allowClear
              onSearch={handleSearch}
              style={{ width: 260 }}
            />
            <Select
              placeholder="筛选部门"
              allowClear
              style={{ width: 180 }}
              value={filterDeptId}
              onChange={handleDeptFilter}
              options={departments.map((dept) => ({
                label: dept.name,
                value: dept._id,
              }))}
            />
          </div>

          <Table
            dataSource={employees}
            rowKey="_id"
            loading={loading}
            columns={columns}
            pagination={{
              current: page,
              pageSize: pageSize,
              total: total,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (t) => `共 ${t} 条`,
              onChange: handlePageChange,
            }}
            size="middle"
            locale={{ emptyText: "暂无员工数据" }}
          />
        </Card>

        <Modal
          title={editingEmployee ? "编辑员工" : "新增员工"}
          open={modalOpen}
          onCancel={() => {
            setModalOpen(false);
            form.resetFields();
            setEditingEmployee(null);
          }}
          footer={null}
          destroyOnClose
          width={520}
        >
          <Form form={form} layout="vertical" onFinish={handleSubmit}>
            <div className="grid grid-cols-2 gap-x-5">
              <Form.Item
                label="工号"
                name="employee_no"
                rules={[{ required: true, message: "请输入工号" }]}
              >
                <Input placeholder="请输入工号" />
              </Form.Item>

              <Form.Item
                label="姓名"
                name="name"
                rules={[{ required: true, message: "请输入姓名" }]}
              >
                <Input placeholder="请输入姓名" />
              </Form.Item>
            </div>

            <div className="grid grid-cols-2 gap-x-5">
              <Form.Item label="性别" name="gender">
                <Radio.Group>
                  <Radio value={0}>未知</Radio>
                  <Radio value={1}>男</Radio>
                  <Radio value={2}>女</Radio>
                </Radio.Group>
              </Form.Item>

              <Form.Item label="部门" name="dept_id">
                <Select
                  placeholder="请选择部门"
                  allowClear
                  options={departments.map((dept) => ({
                    label: dept.name,
                    value: dept._id,
                  }))}
                />
              </Form.Item>
            </div>

            <div className="grid grid-cols-2 gap-x-5">
              <Form.Item label="职位" name="position">
                <Input placeholder="请输入职位" />
              </Form.Item>

              <Form.Item label="手机号" name="phone">
                <Input placeholder="请输入手机号" />
              </Form.Item>
            </div>

            <Form.Item label="状态" name="status">
              <Radio.Group>
                <Radio value={1}>在职</Radio>
                <Radio value={0}>离职</Radio>
              </Radio.Group>
            </Form.Item>

            <div className="flex gap-3 justify-end mt-2">
              <Button onClick={() => setModalOpen(false)}>取消</Button>
              <Button type="primary" htmlType="submit" loading={submitting}>
                {editingEmployee ? "保存" : "创建"}
              </Button>
            </div>
          </Form>
        </Modal>
      </div>
    </div>
  );
}

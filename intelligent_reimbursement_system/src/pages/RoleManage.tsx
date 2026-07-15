import { useState, useEffect } from "react";
import {
  Card,
  Table,
  Modal,
  Form,
  Input,
  Switch,
  Button,
  Tag,
  message,
  Popconfirm,
  Transfer,
  Select,
  TreeSelect,
} from "antd";
import {
  PlusOutlined,
  DeleteOutlined,
  SafetyOutlined,
  EditOutlined,
  UserSwitchOutlined,
} from "@ant-design/icons";
import {
  getRoles,
  createRole,
  updateRole,
  deleteRole,
  assignRolePermissions,
  assignRoleMenus,
  getPermissions,
  getAllUsers,
  assignUserRoles,
} from "../api/role";
import { getEmployees } from "../api/employee";
import { getMenuFlat } from "../api/menu";
import type { RoleItem, PermissionItem } from "../api/role";
import type { Employee } from "../api/employee";
import type { MenuItem } from "../api/menu";

export default function RoleManage() {
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleItem | null>(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  // Permission / menu assignment
  const [permModalOpen, setPermModalOpen] = useState(false);
  const [permTargetRole, setPermTargetRole] = useState<RoleItem | null>(null);
  const [allPermissions, setAllPermissions] = useState<PermissionItem[]>([]);
  const [allMenus, setAllMenus] = useState<MenuItem[]>([]);
  const [selectedPermKeys, setSelectedPermKeys] = useState<string[]>([]);
  const [selectedMenuKeys, setSelectedMenuKeys] = useState<string[]>([]);
  const [permLoading, setPermLoading] = useState(false);

  // Employee role assignment
  const [empModalOpen, setEmpModalOpen] = useState(false);
  const [empTargetRole, setEmpTargetRole] = useState<RoleItem | null>(null);
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [selectedEmpUserIds, setSelectedEmpUserIds] = useState<string[]>([]);
  const [empLoading, setEmpLoading] = useState(false);

  const fetchRoles = async () => {
    setLoading(true);
    try {
      const data = await getRoles();
      setRoles(Array.isArray(data) ? data : []);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoles();
  }, []);

  // Create / Edit role
  const openCreateModal = () => {
    setEditingRole(null);
    form.resetFields();
    form.setFieldsValue({ status: true });
    setModalOpen(true);
  };

  const openEditModal = (role: RoleItem) => {
    setEditingRole(role);
    form.resetFields();
    form.setFieldsValue({
      name: role.name,
      label: role.label,
      description: role.description ?? "",
      status: role.status === 1,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (values: {
    name: string;
    label: string;
    description?: string;
    status: boolean;
  }) => {
    setSubmitting(true);
    try {
      const params = {
        name: values.name.trim(),
        label: values.label.trim(),
        description: values.description?.trim() || undefined,
        status: values.status ? 1 : 0,
      };
      if (editingRole) {
        await updateRole(editingRole._id, params);
        message.success("角色更新成功");
      } else {
        await createRole(params);
        message.success("角色创建成功");
      }
      setModalOpen(false);
      form.resetFields();
      setEditingRole(null);
      fetchRoles();
    } catch {
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteRole(id);
      message.success("角色已删除");
      fetchRoles();
    } catch {
    }
  };

  // Permission + menu assignment
  const openPermModal = async (role: RoleItem) => {
    setPermTargetRole(role);
    setPermModalOpen(true);
    setPermLoading(true);
    try {
      const [perms, menus] = await Promise.all([getPermissions(), getMenuFlat()]);
      setAllPermissions(Array.isArray(perms) ? perms : []);
      setAllMenus(Array.isArray(menus) ? menus : []);
      setSelectedPermKeys(role.permissions?.map((p) => p._id) ?? []);
      setSelectedMenuKeys(role.menus?.map((m) => m._id) ?? []);
    } catch {
    } finally {
      setPermLoading(false);
    }
  };

  type MenuTreeNode = {
    value: string;
    title: string;
    children?: MenuTreeNode[];
  };

  const buildMenuTreeSelect = (
    menus: MenuItem[],
    parentId: string | null = null,
  ): MenuTreeNode[] =>
    menus
      .filter((m) => String(m.parent_id ?? null) === String(parentId ?? null))
      .filter((m) => m.type !== "button")
      .map((m) => ({
        value: m._id,
        title: m.name,
        children: buildMenuTreeSelect(menus, m._id),
      }));

  const handlePermSave = async () => {
    if (!permTargetRole) return;
    try {
      await assignRolePermissions(permTargetRole._id, selectedPermKeys);
      // 显式写入菜单（侧边栏可见性依赖 menus，仅有 permissions 不够）
      await assignRoleMenus(permTargetRole._id, selectedMenuKeys);
      message.success("权限与菜单已保存（相关用户刷新页面后生效）");
      setPermModalOpen(false);
      setPermTargetRole(null);
      fetchRoles();
    } catch {
    }
  };

  // Employee role assignment
  const openEmpModal = async (role: RoleItem) => {
    setEmpTargetRole(role);
    setEmpModalOpen(true);
    setEmpLoading(true);
    try {
      const [empRes, users] = await Promise.all([
        getEmployees({ page_size: 500 }),
        getAllUsers(),
      ]);
      const emps = empRes?.list ?? [];
      const usersArr = Array.isArray(users) ? users : [];
      setAllEmployees(emps);
      setAllUsers(usersArr);
      // Pre-select employees whose user already has this role
      const userIdsWithRole = usersArr
        .filter((u: any) => u.roles?.some((r: any) => r._id === role._id))
        .map((u: any) => u._id);
      const empIds = emps
        .filter((e) => e.uid && userIdsWithRole.includes(e.uid))
        .map((e) => e._id);
      setSelectedEmpUserIds(empIds);
    } catch {
    } finally {
      setEmpLoading(false);
    }
  };

  const handleEmpSave = async () => {
    if (!empTargetRole) return;
    try {
      const roleId = empTargetRole._id;
      const selectedUserIds = allEmployees
        .filter((e) => selectedEmpUserIds.includes(e._id) && e.uid)
        .map((e) => e.uid!);
      const unboundCount = allEmployees.filter(
        (e) => selectedEmpUserIds.includes(e._id) && !e.uid,
      ).length;
      if (unboundCount > 0) {
        message.warning(
          `有 ${unboundCount} 名员工未绑定系统账号，无法分配角色（请先在员工管理关联用户）`,
        );
      }

      const usersToUpdate = allUsers.filter((u: any) => {
        const hasRole = u.roles?.some((r: any) => r._id === roleId);
        const shouldHave = selectedUserIds.includes(u._id);
        return hasRole !== shouldHave;
      });

      if (usersToUpdate.length === 0) {
        message.info("角色成员无变更");
        return;
      }

      await Promise.all(
        usersToUpdate.map((u: any) => {
          const currentRoleIds = u.roles
            ?.filter((r: any) => r._id !== roleId)
            .map((r: any) => r._id) ?? [];
          const shouldHave = selectedUserIds.includes(u._id);
          const newRoles = shouldHave
            ? [...currentRoleIds, roleId]
            : currentRoleIds;
          return assignUserRoles(u._id, newRoles);
        })
      );

      message.success("员工角色分配成功（相关用户刷新页面后生效）");
      setEmpModalOpen(false);
      setEmpTargetRole(null);
    } catch {
    }
  };

  const columns = [
    {
      title: "角色标识",
      dataIndex: "name",
      key: "name",
      render: (v: string) => <code className="text-xs">{v}</code>,
    },
    {
      title: "角色名称",
      dataIndex: "label",
      key: "label",
      render: (v: string) => <span className="font-medium">{v}</span>,
    },
    {
      title: "描述",
      dataIndex: "description",
      key: "description",
      ellipsis: true,
      render: (v: string) => v || <span className="text-[var(--text-tertiary)]">-</span>,
    },
    {
      title: "权限数",
      key: "perm_count",
      width: 80,
      render: (_: unknown, record: RoleItem) => (
        <Tag color="blue">{record.permissions?.length ?? 0}</Tag>
      ),
    },
    {
      title: "状态",
      key: "status",
      width: 80,
      render: (_: unknown, record: RoleItem) => (
        <Tag color={record.status === 1 ? "green" : "default"}>
          {record.status === 1 ? "启用" : "禁用"}
        </Tag>
      ),
    },
    {
      title: "操作",
      key: "actions",
      width: 320,
      render: (_: unknown, record: RoleItem) => (
        <div className="flex gap-1 flex-wrap">
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEditModal(record)}
          >
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            icon={<SafetyOutlined />}
            onClick={() => openPermModal(record)}
          >
            权限/菜单
          </Button>
          <Button
            type="link"
            size="small"
            icon={<UserSwitchOutlined />}
            onClick={() => openEmpModal(record)}
          >
            分配员工
          </Button>
          <Popconfirm
            title="确认删除该角色？"
            description="删除前请确保无用户使用该角色"
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
                <SafetyOutlined className="text-[var(--color-primary)] text-xs" />
              </div>
              角色管理
            </span>
          }
          extra={
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={openCreateModal}
            >
              新增角色
            </Button>
          }
        >
          <Table
            dataSource={roles}
            rowKey="_id"
            loading={loading}
            columns={columns}
            pagination={false}
            size="middle"
            locale={{ emptyText: "暂无角色数据" }}
          />
        </Card>

        {/* Create / Edit modal */}
        <Modal
          title={editingRole ? "编辑角色" : "新增角色"}
          open={modalOpen}
          onCancel={() => {
            setModalOpen(false);
            form.resetFields();
            setEditingRole(null);
          }}
          footer={null}
          destroyOnClose
        >
          <Form form={form} layout="vertical" onFinish={handleSubmit}>
            <Form.Item
              label="角色标识"
              name="name"
              rules={[{ required: true, message: "请输入角色标识" }]}
            >
              <Input placeholder="如 admin、manager" />
            </Form.Item>
            <Form.Item
              label="角色名称"
              name="label"
              rules={[{ required: true, message: "请输入角色名称" }]}
            >
              <Input placeholder="如 管理员、部门经理" />
            </Form.Item>
            <Form.Item label="描述" name="description">
              <Input.TextArea rows={2} placeholder="角色描述" />
            </Form.Item>
            <Form.Item label="状态" name="status" valuePropName="checked">
              <Switch checkedChildren="启用" unCheckedChildren="禁用" />
            </Form.Item>
            <div className="flex gap-3 justify-end mt-2">
              <Button onClick={() => setModalOpen(false)}>取消</Button>
              <Button type="primary" htmlType="submit" loading={submitting}>
                {editingRole ? "保存" : "创建"}
              </Button>
            </div>
          </Form>
        </Modal>

        {/* Permission + menu assignment modal */}
        <Modal
          title={`分配权限与菜单 — ${permTargetRole?.label ?? ""}`}
          open={permModalOpen}
          onCancel={() => {
            setPermModalOpen(false);
            setPermTargetRole(null);
          }}
          onOk={handlePermSave}
          okText="保存"
          cancelText="取消"
          width={760}
        >
          {permLoading ? (
            <div className="text-center py-8 text-[var(--text-tertiary)]">
              加载中...
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-[var(--text-secondary)] mb-2">
                  功能权限（按钮/接口能力）：
                </p>
                <Transfer
                  dataSource={allPermissions.map((p) => ({
                    key: p._id,
                    title: `${p.label} (${p.name})`,
                    description: p.description ?? "",
                  }))}
                  titles={["可选权限", "已分配"]}
                  targetKeys={selectedPermKeys}
                  onChange={(keys) => setSelectedPermKeys(keys as string[])}
                  render={(item) => item.title ?? ""}
                  listStyle={{ width: 300, height: 280 }}
                  showSearch
                  filterOption={(input, option) =>
                    (option?.title ?? "").toLowerCase().includes(input.toLowerCase())
                  }
                />
              </div>
              <div>
                <p className="text-sm text-[var(--text-secondary)] mb-2">
                  可见菜单（侧边栏与页面入口，缺此则有权限也进不了页面）：
                </p>
                <TreeSelect
                  className="w-full"
                  treeCheckable
                  showCheckedStrategy={TreeSelect.SHOW_ALL}
                  placeholder="选择该角色可见的菜单"
                  value={selectedMenuKeys}
                  onChange={(keys) => setSelectedMenuKeys(keys as string[])}
                  treeData={buildMenuTreeSelect(allMenus)}
                  maxTagCount="responsive"
                  allowClear
                  treeDefaultExpandAll
                />
              </div>
            </div>
          )}
        </Modal>

        {/* Employee role assignment modal */}
        <Modal
          title={`分配员工 — ${empTargetRole?.label ?? ""}`}
          open={empModalOpen}
          onCancel={() => {
            setEmpModalOpen(false);
            setEmpTargetRole(null);
          }}
          onOk={handleEmpSave}
          okText="保存"
          cancelText="取消"
          width={600}
        >
          {empLoading ? (
            <div className="text-center py-8 text-[var(--text-tertiary)]">
              加载中...
            </div>
          ) : (
            <div>
              <p className="text-sm text-[var(--text-secondary)] mb-3">
                选择需要分配此角色的员工（支持多选）：
              </p>
              <Select
                mode="multiple"
                className="w-full"
                placeholder="搜索或选择员工"
                value={selectedEmpUserIds}
                onChange={setSelectedEmpUserIds}
                optionFilterProp="label"
                options={allEmployees
                  .filter((emp) => emp.uid)
                  .map((emp) => ({
                    label: `${emp.name}${emp.employee_no ? ` (${emp.employee_no})` : ""}${emp.position ? ` / ${emp.position}` : ""}`,
                    value: emp._id,
                  }))}
                maxTagCount="responsive"
              />
            </div>
          )}
        </Modal>
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  Table,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Switch,
  Button,
  Tag,
  message,
  Popconfirm,
  TreeSelect,
} from "antd";
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  MenuOutlined,
  FolderOutlined,
  FileOutlined,
  ControlOutlined,
} from "@ant-design/icons";
import {
  getMenuTree,
  getMenuFlat,
  createMenu,
  updateMenu,
  deleteMenu,
} from "../api/menu";
import { getRoles, assignRoleMenus } from "../api/role";
import type { MenuItem } from "../api/menu";
import type { RoleItem } from "../api/role";

export default function MenuManage() {
  const [treeData, setTreeData] = useState<MenuItem[]>([]);
  const [flatMenus, setFlatMenus] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingMenu, setEditingMenu] = useState<MenuItem | null>(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  // Role assignment
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [roleTargetMenu, setRoleTargetMenu] = useState<MenuItem | null>(null);
  const [allRoles, setAllRoles] = useState<RoleItem[]>([]);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [roleLoading, setRoleLoading] = useState(false);

  const fetchMenus = async () => {
    setLoading(true);
    try {
      const [tree, flat] = await Promise.all([getMenuTree(), getMenuFlat()]);
      setTreeData(Array.isArray(tree) ? tree : []);
      setFlatMenus(Array.isArray(flat) ? flat : []);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMenus();
  }, []);

  // Build TreeSelect data from flat menus
  const buildTreeSelectData = useCallback(
    (menus: MenuItem[], parentId: string | null = null): any[] => {
      return menus
        .filter((m) => String(m.parent_id ?? null) === String(parentId ?? null))
        .map((m) => ({
          value: m._id,
          title: m.name,
          icon:
            m.type === "directory" ? (
              <FolderOutlined />
            ) : m.type === "menu" ? (
              <FileOutlined />
            ) : (
              <ControlOutlined />
            ),
          children: buildTreeSelectData(menus, m._id),
        }));
    },
    []
  );

  // Create / Edit
  const openCreateModal = (parentId?: string) => {
    setEditingMenu(null);
    form.resetFields();
    form.setFieldsValue({
      sort: 0,
      visible: true,
      status: true,
      parent_id: parentId || undefined,
    });
    setModalOpen(true);
  };

  const openEditModal = (menu: MenuItem) => {
    setEditingMenu(menu);
    form.resetFields();
    form.setFieldsValue({
      name: menu.name,
      sort: menu.sort ?? 0,
      parent_id: menu.parent_id || undefined,
      visible: menu.visible === 1,
      status: menu.status === 1,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (values: any) => {
    setSubmitting(true);
    try {
      const params = {
        name: values.name.trim(),
        type: "menu" as const,
        sort: values.sort ?? 0,
        parent_id: values.parent_id || undefined,
        visible: values.visible ? 1 : 0,
        status: values.status ? 1 : 0,
      };
      if (editingMenu) {
        await updateMenu(editingMenu._id, params);
        message.success("菜单更新成功");
      } else {
        await createMenu(params);
        message.success("菜单创建成功");
      }
      setModalOpen(false);
      form.resetFields();
      setEditingMenu(null);
      fetchMenus();
    } catch {
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMenu(id);
      message.success("菜单已删除");
      fetchMenus();
    } catch {}
  };

  // Role assignment
  const openRoleModal = async (menu: MenuItem) => {
    setRoleTargetMenu(menu);
    setRoleModalOpen(true);
    setRoleLoading(true);
    try {
      const roles = await getRoles();
      const rolesArr = Array.isArray(roles) ? roles : [];
      setAllRoles(rolesArr);
      // Pre-select roles that already have this menu
      const roleIds = rolesArr
        .filter((r: RoleItem) => r.menus?.some((m: any) => m._id === menu._id))
        .map((r: RoleItem) => r._id);
      setSelectedRoleIds(roleIds);
    } catch {
    } finally {
      setRoleLoading(false);
    }
  };

  const handleRoleSave = async () => {
    if (!roleTargetMenu) return;
    try {
      // For each role, ensure this menu is in its menus array (or not)
      const menuId = roleTargetMenu._id;
      const rolesToUpdate = allRoles.filter((r: RoleItem) => {
        const hasMenu = r.menus?.some((m: any) => m._id === menuId);
        const shouldHave = selectedRoleIds.includes(r._id);
        return hasMenu !== shouldHave;
      });

      await Promise.all(
        rolesToUpdate.map((r: RoleItem) => {
          const currentMenuIds =
            r.menus
              ?.filter((m: any) => m._id !== menuId)
              .map((m: any) => m._id) ?? [];
          const shouldHave = selectedRoleIds.includes(r._id);
          const newMenus = shouldHave
            ? [...currentMenuIds, menuId]
            : currentMenuIds;
          return assignRoleMenus(r._id, newMenus);
        })
      );

      message.success("菜单角色分配成功");
      setRoleModalOpen(false);
      setRoleTargetMenu(null);
    } catch {}
  };

  const columns = [
    {
      title: "名称",
      dataIndex: "name",
      key: "name",
      render: (v: string, record: MenuItem) => (
        <span className="flex items-center gap-1.5">
          {record.type === "directory" ? (
            <FolderOutlined className="text-[var(--color-primary)]" />
          ) : record.type === "menu" ? (
            <FileOutlined className="text-[var(--color-success)]" />
          ) : (
            <ControlOutlined className="text-[var(--color-warning)]" />
          )}
          <span className="font-medium">{v}</span>
        </span>
      ),
    },
    {
      title: "排序",
      dataIndex: "sort",
      key: "sort",
      width: 80,
    },
    {
      title: "可见",
      dataIndex: "visible",
      key: "visible",
      width: 80,
      render: (v: number) => (
        <Tag color={v === 1 ? "green" : "default"}>
          {v === 1 ? "是" : "否"}
        </Tag>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 80,
      render: (v: number) => (
        <Tag color={v === 1 ? "green" : "default"}>
          {v === 1 ? "启用" : "禁用"}
        </Tag>
      ),
    },
    {
      title: "操作",
      key: "actions",
      width: 280,
      render: (_: unknown, record: MenuItem) => (
        <div className="flex gap-1 flex-wrap">
          {record.type !== "button" && (
            <Button
              type="link"
              size="small"
              icon={<PlusOutlined />}
              onClick={() => openCreateModal(record._id)}
            >
              子菜单
            </Button>
          )}
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
            icon={<MenuOutlined />}
            onClick={() => openRoleModal(record)}
          >
            角色
          </Button>
          <Popconfirm
            title="确认删除该菜单？"
            description="若有子菜单需先删除子菜单"
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
                <MenuOutlined className="text-[var(--color-primary)] text-xs" />
              </div>
              菜单管理
            </span>
          }
          extra={
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => openCreateModal()}
            >
              新增菜单
            </Button>
          }
        >
          <Table
            dataSource={treeData}
            rowKey="_id"
            loading={loading}
            columns={columns}
            pagination={false}
            size="middle"
            childrenColumnName="children"
            locale={{ emptyText: "暂无菜单数据" }}
            scroll={{ x: 900 }}
          />
        </Card>

        {/* Create / Edit modal */}
        <Modal
          title={editingMenu ? "编辑菜单" : "新增菜单"}
          open={modalOpen}
          onCancel={() => {
            setModalOpen(false);
            form.resetFields();
            setEditingMenu(null);
          }}
          footer={null}
          destroyOnClose
          width={560}
        >
          <Form form={form} layout="vertical" onFinish={handleSubmit}>
            <Form.Item
              label="菜单名称"
              name="name"
              rules={[{ required: true, message: "请输入菜单名称" }]}
            >
              <Input placeholder="如 报销管理" />
            </Form.Item>
            <div className="grid grid-cols-2 gap-4">
              <Form.Item label="上级菜单" name="parent_id">
                <TreeSelect
                  allowClear
                  placeholder="无（顶级菜单）"
                  treeData={buildTreeSelectData(flatMenus)}
                  treeDefaultExpandAll
                />
              </Form.Item>
              <Form.Item label="排序" name="sort">
                <InputNumber className="w-full" min={0} />
              </Form.Item>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Form.Item label="可见" name="visible" valuePropName="checked">
                <Switch checkedChildren="是" unCheckedChildren="否" />
              </Form.Item>
              <Form.Item label="状态" name="status" valuePropName="checked">
                <Switch checkedChildren="启用" unCheckedChildren="禁用" />
              </Form.Item>
            </div>
            <div className="flex gap-3 justify-end mt-2">
              <Button onClick={() => setModalOpen(false)}>取消</Button>
              <Button type="primary" htmlType="submit" loading={submitting}>
                {editingMenu ? "保存" : "创建"}
              </Button>
            </div>
          </Form>
        </Modal>

        {/* Role assignment modal */}
        <Modal
          title={`分配角色 — ${roleTargetMenu?.name ?? ""}`}
          open={roleModalOpen}
          onCancel={() => {
            setRoleModalOpen(false);
            setRoleTargetMenu(null);
          }}
          onOk={handleRoleSave}
          okText="保存"
          cancelText="取消"
          width={600}
        >
          {roleLoading ? (
            <div className="text-center py-8 text-[var(--text-tertiary)]">
              加载中...
            </div>
          ) : (
            <div>
              <p className="text-sm text-[var(--text-secondary)] mb-3">
                选择可以访问此菜单的角色（支持多选）：
              </p>
              <Select
                mode="multiple"
                className="w-full"
                placeholder="搜索或选择角色"
                value={selectedRoleIds}
                onChange={setSelectedRoleIds}
                optionFilterProp="label"
                options={allRoles.map((r) => ({
                  label: `${r.label} (${r.name})`,
                  value: r._id,
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

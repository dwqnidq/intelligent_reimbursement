import { useState, useEffect } from "react";
import {
  Card,
  Table,
  Modal,
  Button,
  Tag,
  message,
  Select,
  Descriptions,
} from "antd";
import {
  KeyOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import {
  getPermissions,
  getRoles,
  assignRolePermissions,
} from "../api/role";
import type { PermissionItem, RoleItem } from "../api/role";

export default function PermissionManage() {
  const [permissions, setPermissions] = useState<PermissionItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Assign to role modal
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [targetPerm, setTargetPerm] = useState<PermissionItem | null>(null);
  const [allRoles, setAllRoles] = useState<RoleItem[]>([]);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [assignLoading, setAssignLoading] = useState(false);

  const fetchPermissions = async () => {
    setLoading(true);
    try {
      const data = await getPermissions();
      setPermissions(Array.isArray(data) ? data : []);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPermissions();
  }, []);

  const openAssignModal = async (perm: PermissionItem) => {
    setTargetPerm(perm);
    setAssignModalOpen(true);
    setAssignLoading(true);
    try {
      const roles = await getRoles();
      const rolesArr = Array.isArray(roles) ? roles : [];
      setAllRoles(rolesArr);
      // Pre-select roles that already have this permission
      const roleIds = rolesArr
        .filter((r) => r.permissions?.some((p) => p._id === perm._id))
        .map((r) => r._id);
      setSelectedRoleIds(roleIds);
    } catch {
    } finally {
      setAssignLoading(false);
    }
  };

  const handleAssignSave = async () => {
    if (!targetPerm) return;
    try {
      const permId = targetPerm._id;
      const rolesToUpdate = allRoles.filter((r) => {
        const hasPerm = r.permissions?.some((p) => p._id === permId);
        const shouldHave = selectedRoleIds.includes(r._id);
        return hasPerm !== shouldHave;
      });

      if (rolesToUpdate.length === 0) {
        message.info("角色权限无变更");
        return;
      }

      await Promise.all(
        rolesToUpdate.map((r) => {
          const currentPermIds = r.permissions
            ?.filter((p) => p._id !== permId)
            .map((p) => p._id) ?? [];
          const shouldHave = selectedRoleIds.includes(r._id);
          const newPerms = shouldHave
            ? [...currentPermIds, permId]
            : currentPermIds;
          return assignRolePermissions(r._id, newPerms);
        })
      );

      message.success("权限分配成功（已同步关联菜单；相关用户刷新页面后生效）");
      setAssignModalOpen(false);
      setTargetPerm(null);
      fetchPermissions();
    } catch {
    }
  };

  const columns = [
    {
      title: "权限标识",
      dataIndex: "name",
      key: "name",
      render: (v: string) => <code className="text-xs">{v}</code>,
    },
    {
      title: "权限名称",
      dataIndex: "label",
      key: "label",
      render: (v: string) => <span className="font-medium">{v}</span>,
    },
    {
      title: "类型",
      dataIndex: "type",
      key: "type",
      width: 80,
      render: (v: string) => (
        <Tag color={v === "api" ? "blue" : "green"}>
          {v === "api" ? "API" : "按钮"}
        </Tag>
      ),
    },
    {
      title: "资源",
      dataIndex: "resource",
      key: "resource",
      ellipsis: true,
      render: (v: string) => v || "-",
    },
    {
      title: "操作",
      dataIndex: "action",
      key: "action",
      ellipsis: true,
      render: (v: string) => v || "-",
    },
    {
      title: "描述",
      dataIndex: "description",
      key: "description",
      ellipsis: true,
      render: (v: string) => v || <span className="text-[var(--text-tertiary)]">-</span>,
    },
    {
      title: "操作",
      key: "actions",
      width: 120,
      render: (_: unknown, record: PermissionItem) => (
        <Button
          type="link"
          size="small"
          icon={<TeamOutlined />}
          onClick={() => openAssignModal(record)}
        >
          分配角色
        </Button>
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
                <KeyOutlined className="text-[var(--color-primary)] text-xs" />
              </div>
              权限管理
            </span>
          }
        >
          <Table
            dataSource={permissions}
            rowKey="_id"
            loading={loading}
            columns={columns}
            pagination={{ pageSize: 15, showTotal: (t) => `共 ${t} 项权限` }}
            size="middle"
            locale={{ emptyText: "暂无权限数据" }}
          />
        </Card>

        {/* Assign permission to roles modal */}
        <Modal
          title={`分配角色 — ${targetPerm?.label ?? ""}`}
          open={assignModalOpen}
          onCancel={() => {
            setAssignModalOpen(false);
            setTargetPerm(null);
          }}
          onOk={handleAssignSave}
          okText="保存"
          cancelText="取消"
          width={520}
        >
          {assignLoading ? (
            <div className="text-center py-8 text-[var(--text-tertiary)]">
              加载中...
            </div>
          ) : (
            <div>
              <Descriptions column={1} size="small" className="mb-4">
                <Descriptions.Item label="权限标识">
                  <code className="text-xs">{targetPerm?.name}</code>
                </Descriptions.Item>
                <Descriptions.Item label="类型">
                  <Tag color={targetPerm?.type === "api" ? "blue" : "green"}>
                    {targetPerm?.type === "api" ? "API" : "按钮"}
                  </Tag>
                </Descriptions.Item>
                {targetPerm?.description && (
                  <Descriptions.Item label="描述">
                    {targetPerm.description}
                  </Descriptions.Item>
                )}
              </Descriptions>
              <p className="text-sm text-[var(--text-secondary)] mb-2">
                选择需要拥有此权限的角色：
              </p>
              <Select
                mode="multiple"
                className="w-full"
                placeholder="选择角色"
                value={selectedRoleIds}
                onChange={setSelectedRoleIds}
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

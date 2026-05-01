import { useState, useEffect, useCallback } from "react";
import {
  Card,
  Row,
  Col,
  List,
  Tag,
  Switch,
  Input,
  Button,
  Select,
  Avatar,
  Modal,
  message,
  Spin,
  Empty,
  Popconfirm,
} from "antd";
import {
  HolderOutlined,
  DeleteOutlined,
  PlusOutlined,
  UserOutlined,
} from "@ant-design/icons";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { getReimbursementTypes } from "../api/reimbursement";
import type { ReimbursementType } from "../api/reimbursement";
import {
  getApprovalFlows,
  createApprovalFlow,
  updateApprovalFlow,
  toggleApprovalFlow,
} from "../api/approvalFlow";
import type { ApprovalFlow } from "../api/approvalFlow";
import { getEmployees } from "../api/employee";
import type { Employee } from "../api/employee";
import { getDepartments } from "../api/department";
import { useAuthStore } from "../store/useAuthStore";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface FlowNode {
  node_id: string;
  name: string;
  approver_id: string;
  sign_type: "countersign" | "orsign";
  sort: number;
  approver_info?: {
    name: string;
    avatar?: string;
    position?: string;
    dept_name?: string;
  };
}

/* ------------------------------------------------------------------ */
/*  Sortable Node Card                                                 */
/* ------------------------------------------------------------------ */

function SortableNodeCard({
  node,
  onSignTypeChange,
  onDelete,
}: {
  node: FlowNode;
  onSignTypeChange: (id: string, value: "countersign" | "orsign") => void;
  onDelete: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: node.node_id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform && { ...transform, scaleY: 1 }),
    transition,
    ...(isDragging ? { position: "relative", zIndex: 1, opacity: 0.9 } : {}),
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className="flex items-center gap-3 p-3 mb-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)]"
    >
      {/* Drag handle */}
      <HolderOutlined
        {...listeners}
        style={{ cursor: "grab", color: "#999", touchAction: "none", fontSize: 16 }}
      />

      {/* Step number */}
      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--color-primary)] text-white text-xs flex items-center justify-center font-medium">
        {node.sort + 1}
      </span>

      {/* Avatar */}
      <Avatar
        size={36}
        src={node.approver_info?.avatar}
        icon={<UserOutlined />}
      />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-[var(--text-primary)] truncate">
          {node.approver_info?.name ?? node.name}
        </div>
        <div className="text-xs text-[var(--text-tertiary)] truncate">
          {node.approver_info?.dept_name && (
            <span>{node.approver_info.dept_name}</span>
          )}
          {node.approver_info?.dept_name && node.approver_info?.position && (
            <span> / </span>
          )}
          {node.approver_info?.position && (
            <span>{node.approver_info.position}</span>
          )}
          {!node.approver_info?.dept_name && !node.approver_info?.position && (
            <span>{node.approver_id}</span>
          )}
        </div>
      </div>

      {/* Sign type */}
      <Select
        size="small"
        value={node.sign_type}
        onChange={(v) => onSignTypeChange(node.node_id, v)}
        style={{ width: 90 }}
        options={[
          { label: "会签", value: "countersign" },
          { label: "或签", value: "orsign" },
        ]}
      />

      {/* Delete */}
      <Popconfirm
        title="确认删除该审批节点？"
        onConfirm={() => onDelete(node.node_id)}
      >
        <Button type="text" danger size="small" icon={<DeleteOutlined />} />
      </Popconfirm>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function ApprovalFlowManage() {
  const isAdmin = useAuthStore((s) => s.permissions.includes("approval_flow:manage"));

  // Left panel
  const [typeList, setTypeList] = useState<ReimbursementType[]>([]);
  const [flowList, setFlowList] = useState<ApprovalFlow[]>([]);
  const [typeLoading, setTypeLoading] = useState(false);
  const [selectedTypeCode, setSelectedTypeCode] = useState<string | null>(null);

  // Right panel
  const [flowName, setFlowName] = useState("");
  const [flowEnabled, setFlowEnabled] = useState(false);
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [saving, setSaving] = useState(false);

  // Add approver modal
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [empLoading, setEmpLoading] = useState(false);
  const [empSearch, setEmpSearch] = useState("");
  const [deptMap, setDeptMap] = useState<Record<string, string>>({});

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  /* ---- Fetch helpers ---- */

  const fetchTypes = useCallback(() => {
    setTypeLoading(true);
    getReimbursementTypes()
      .then((data) => setTypeList(data ?? []))
      .catch(() => {})
      .finally(() => setTypeLoading(false));
  }, []);

  const fetchFlows = useCallback(() => {
    getApprovalFlows()
      .then((data) => setFlowList(data ?? []))
      .catch(() => {});
  }, []);

  const fetchDepts = useCallback(() => {
    getDepartments()
      .then((data) => {
        const map: Record<string, string> = {};
        (data ?? []).forEach((d) => {
          map[d._id] = d.name;
        });
        setDeptMap(map);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchTypes();
    fetchFlows();
    fetchDepts();
  }, [fetchTypes, fetchFlows, fetchDepts]);

  /* ---- Employees for add modal ---- */

  const fetchEmployees = useCallback((search?: string) => {
    setEmpLoading(true);
    getEmployees({ name: search, page_size: 100 })
      .then((data) => setEmployees(data?.list ?? []))
      .catch(() => {})
      .finally(() => setEmpLoading(false));
  }, []);

  useEffect(() => {
    if (addModalOpen) {
      fetchEmployees(empSearch || undefined);
    }
  }, [addModalOpen, empSearch, fetchEmployees]);

  /* ---- Select a type ---- */

  const selectedType = typeList.find((t) => t.code === selectedTypeCode) ?? null;

  // When user selects a type, check if an existing flow is bound
  const handleSelectType = useCallback(
    (code: string) => {
      setSelectedTypeCode(code);
      const existing = flowList.find((f) => f.type_code === code);
      if (existing) {
        setFlowName(existing.name);
        setFlowEnabled(existing.enabled);
        setNodes(
          (existing.nodes ?? []).map((n, i) => ({
            node_id: n.node_id || `node-${i}`,
            name: typeof n.approver_id === "object" ? n.approver_id.name : n.name,
            approver_id:
              typeof n.approver_id === "object" ? n.approver_id._id : n.approver_id,
            sign_type: n.sign_type,
            sort: n.sort ?? i,
            approver_info:
              typeof n.approver_id === "object"
                ? {
                    name: n.approver_id.name,
                    avatar: n.approver_id.avatar,
                    position: n.approver_id.position,
                    dept_name: n.approver_id.dept_id?.name,
                  }
                : undefined,
          })),
        );
      } else {
        setFlowName("");
        setFlowEnabled(false);
        setNodes([]);
      }
    },
    [flowList],
  );

  /* ---- Drag end ---- */

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setNodes((prev) => {
        const oldIndex = prev.findIndex((n) => n.node_id === active.id);
        const newIndex = prev.findIndex((n) => n.node_id === over.id);
        return arrayMove(prev, oldIndex, newIndex).map((n, i) => ({
          ...n,
          sort: i,
        }));
      });
    }
  };

  /* ---- Node operations ---- */

  const onSignTypeChange = (nodeId: string, value: "countersign" | "orsign") => {
    setNodes((prev) =>
      prev.map((n) => (n.node_id === nodeId ? { ...n, sign_type: value } : n)),
    );
  };

  const onDeleteNode = (nodeId: string) => {
    setNodes((prev) =>
      prev
        .filter((n) => n.node_id !== nodeId)
        .map((n, i) => ({ ...n, sort: i })),
    );
  };

  const onAddApprover = (empId: string) => {
    const emp = employees.find((e) => e._id === empId);
    if (!emp) return;
    // Prevent duplicate
    if (nodes.some((n) => n.approver_id === empId)) {
      message.warning("该审批人已在列表中");
      return;
    }
    const newNode: FlowNode = {
      node_id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: emp.name,
      approver_id: emp._id,
      sign_type: "countersign",
      sort: nodes.length,
      approver_info: {
        name: emp.name,
        avatar: emp.avatar,
        position: emp.position,
        dept_name: emp.dept_id?.name,
      },
    };
    setNodes((prev) => [...prev, newNode]);
    setAddModalOpen(false);
  };

  /* ---- Toggle flow enabled ---- */

  const handleToggleEnabled = async (checked: boolean) => {
    if (!selectedTypeCode) return;
    const existing = flowList.find((f) => f.type_code === selectedTypeCode);
    setFlowEnabled(checked);
    if (existing) {
      try {
        await toggleApprovalFlow(existing._id);
        setFlowList((prev) =>
          prev.map((f) =>
            f._id === existing._id ? { ...f, enabled: checked } : f,
          ),
        );
        message.success(checked ? "审批流已启用" : "审批流已禁用");
      } catch {
        setFlowEnabled(!checked);
      }
    }
  };

  /* ---- Save ---- */

  const handleSave = async () => {
    if (!selectedTypeCode) {
      message.warning("请先选择报销类型");
      return;
    }
    if (!flowName.trim()) {
      message.warning("请输入审批流名称");
      return;
    }
    if (nodes.length === 0) {
      message.warning("请至少添加一个审批节点");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: flowName.trim(),
        type_code: selectedTypeCode,
        enabled: flowEnabled,
        nodes: nodes.map((n) => ({
          node_id: n.node_id,
          name: n.name,
          approver_id: n.approver_id,
          sign_type: n.sign_type,
          sort: n.sort,
        })),
      };

      const existing = flowList.find((f) => f.type_code === selectedTypeCode);
      if (existing) {
        await updateApprovalFlow(existing._id, payload);
        message.success("审批流更新成功");
      } else {
        await createApprovalFlow(payload);
        message.success("审批流创建成功");
      }
      fetchFlows();
    } catch {
      // Interceptor handles error messages
    } finally {
      setSaving(false);
    }
  };

  /* ---- Render ---- */

  return (
    <div className="w-full">
      <Row gutter={16}>
        {/* ---- Left panel ---- */}
        <Col xs={24} md={8}>
          <Card title="报销类型" className="h-full" bodyStyle={{ padding: 0 }}>
            <Spin spinning={typeLoading}>
              {typeList.length === 0 && !typeLoading ? (
                <Empty
                  description="暂无报销类型"
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  className="py-8"
                />
              ) : (
                <List
                  dataSource={typeList}
                  renderItem={(item) => {
                    const hasFlow = flowList.some(
                      (f) => f.type_code === item.code,
                    );
                    const flow = flowList.find(
                      (f) => f.type_code === item.code,
                    );
                    const isSelected = selectedTypeCode === item.code;
                    return (
                      <List.Item
                        onClick={() => handleSelectType(item.code)}
                        style={{
                          cursor: "pointer",
                          background: isSelected
                            ? "var(--color-primary-bg)"
                            : undefined,
                          borderLeft: isSelected
                            ? "3px solid var(--color-primary)"
                            : "3px solid transparent",
                          padding: "12px 16px",
                        }}
                      >
                        <div className="flex items-center justify-between w-full">
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-[var(--text-primary)]">
                              {item.label}
                            </span>
                            <span className="text-xs text-[var(--text-tertiary)]">
                              {item.code}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {hasFlow ? (
                              <Tag color="success">已配置</Tag>
                            ) : (
                              <Tag>未配置</Tag>
                            )}
                            {hasFlow && (
                              <Switch
                                size="small"
                                checked={flow?.enabled ?? false}
                                onChange={(checked) => {
                                  handleToggleEnabled(checked);
                                }}
                              />
                            )}
                          </div>
                        </div>
                      </List.Item>
                    );
                  }}
                />
              )}
            </Spin>
          </Card>
        </Col>

        {/* ---- Right panel ---- */}
        <Col xs={24} md={16}>
          <Card title="审批流配置" className="h-full">
            {!selectedTypeCode ? (
              <Empty
                description="请在左侧选择一个报销类型"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                className="py-16"
              />
            ) : (
              <div>
                {/* Top: flow name + enable switch */}
                <div className="flex items-center gap-4 mb-4">
                  <Input
                    placeholder="审批流名称"
                    value={flowName}
                    onChange={(e) => setFlowName(e.target.value)}
                    style={{ maxWidth: 320 }}
                  />
                  {isAdmin && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-[var(--text-secondary)]">
                        启用:
                      </span>
                      <Switch
                        checked={flowEnabled}
                        onChange={handleToggleEnabled}
                      />
                    </div>
                  )}
                </div>

                {/* DnD area */}
                <div className="min-h-[120px] mb-4">
                  {nodes.length === 0 ? (
                    <div className="flex items-center justify-center py-10 border border-dashed border-[var(--border-color)] rounded-lg text-[var(--text-tertiary)] text-sm">
                      暂无审批节点，请点击下方按钮添加审批人
                    </div>
                  ) : (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={onDragEnd}
                    >
                      <SortableContext
                        items={nodes.map((n) => n.node_id)}
                        strategy={verticalListSortingStrategy}
                      >
                        {nodes.map((node) => (
                          <SortableNodeCard
                            key={node.node_id}
                            node={node}
                            onSignTypeChange={onSignTypeChange}
                            onDelete={onDeleteNode}
                          />
                        ))}
                      </SortableContext>
                    </DndContext>
                  )}
                </div>

                {/* Bottom: add + save */}
                <div className="flex items-center gap-3">
                  <Button
                    icon={<PlusOutlined />}
                    onClick={() => setAddModalOpen(true)}
                  >
                    添加审批人
                  </Button>
                  <Button type="primary" loading={saving} onClick={handleSave}>
                    保存
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* ---- Add Approver Modal ---- */}
      <Modal
        title="选择审批人"
        open={addModalOpen}
        onCancel={() => setAddModalOpen(false)}
        footer={null}
        width={480}
      >
        <div className="mb-3">
          <Input.Search
            placeholder="搜索员工姓名"
            allowClear
            onSearch={(v) => setEmpSearch(v)}
            onChange={(e) => {
              if (!e.target.value) setEmpSearch("");
            }}
          />
        </div>
        <Spin spinning={empLoading}>
          <List
            dataSource={employees}
            locale={{ emptyText: "暂无员工数据" }}
            style={{ maxHeight: 400, overflow: "auto" }}
            renderItem={(emp) => (
              <List.Item
                style={{ cursor: "pointer", padding: "10px 12px" }}
                onClick={() => onAddApprover(emp._id)}
              >
                <List.Item.Meta
                  avatar={
                    <Avatar
                      src={emp.avatar}
                      icon={<UserOutlined />}
                      size={40}
                    />
                  }
                  title={emp.name}
                  description={
                    <span className="text-xs text-[var(--text-tertiary)]">
                      {emp.dept_id?.name ?? ""}
                      {emp.dept_id?.name && emp.position ? " / " : ""}
                      {emp.position ?? ""}
                      {emp.employee_no ? ` (${emp.employee_no})` : ""}
                    </span>
                  }
                />
              </List.Item>
            )}
          />
        </Spin>
      </Modal>
    </div>
  );
}

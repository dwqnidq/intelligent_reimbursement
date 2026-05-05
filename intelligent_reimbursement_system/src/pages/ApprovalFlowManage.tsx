import { useState, useEffect, useCallback } from "react";
import {
  Card,
  Row,
  Col,
  List,
  Tag,
  Switch,
  Button,
  Select,
  Avatar,
  Modal,
  message,
  Spin,
  Empty,
  Popconfirm,
  Tooltip,
  Input,
  InputNumber,
} from "antd";
import {
  HolderOutlined,
  DeleteOutlined,
  PlusOutlined,
  UserOutlined,
  CloseCircleFilled,
  CheckCircleFilled,
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
  deleteApprovalFlow,
  reorderApprovalFlows,
} from "../api/approvalFlow";
import type { ApprovalFlow, ApproverDetail } from "../api/approvalFlow";
import { getEmployees } from "../api/employee";
import type { Employee } from "../api/employee";
import { useAuthStore } from "../store/useAuthStore";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface FlowNode {
  node_id: string;
  approvers: ApproverDetail[];
  approver_ids: string[];
  sign_type: "countersign" | "orsign";
  sort: number;
}

/* ------------------------------------------------------------------ */
/*  Sortable Flow Card (left panel)                                    */
/* ------------------------------------------------------------------ */

function SortableFlowCard({
  flow,
  typeLabel,
  isSelected,
  onSelect,
  onToggle,
  onDelete,
  showHandle = true,
}: {
  flow: ApprovalFlow;
  typeLabel: string;
  isSelected: boolean;
  onSelect: () => void;
  onToggle: (checked: boolean) => void;
  onDelete: () => void;
  showHandle?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: flow._id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform && { ...transform, scaleY: 1 }),
    transition,
    ...(isDragging ? { position: "relative", zIndex: 1, opacity: 0.9 } : {}),
  };

  const nodeCount = flow.nodes?.length ?? 0;
  const amountLabel =
    flow.amount_min != null || flow.amount_max != null
      ? `${flow.amount_min ?? 0}~${flow.amount_max ?? "不限"}元`
      : "不限金额";

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      onClick={onSelect}
      className={`p-3 mb-2 rounded-lg border cursor-pointer transition-colors ${
        isSelected
          ? "border-[var(--color-primary)] bg-[var(--color-primary-bg)]"
          : "border-[var(--border-color)] bg-[var(--bg-card)] hover:border-[var(--color-primary)]"
      }`}
    >
      <div className="flex items-center gap-2">
        {showHandle && (
          <HolderOutlined
            {...listeners}
            style={{ cursor: "grab", color: "#999", touchAction: "none", fontSize: 14 }}
            onClick={(e) => e.stopPropagation()}
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-[var(--text-primary)] truncate">
              {typeLabel}
            </span>
            <Tag color="blue" className="text-[10px] flex-shrink-0">
              {amountLabel}
            </Tag>
          </div>
          <div className="text-xs text-[var(--text-tertiary)]">
            {nodeCount}个节点 · 优先级 {(flow.priority ?? 0) + 1}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <Switch
            size="small"
            checked={flow.enabled}
            onChange={onToggle}
          />
          <Popconfirm title="确认删除该审批流？" onConfirm={onDelete}>
            <Button type="text" danger size="small" icon={<DeleteOutlined />} />
          </Popconfirm>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sortable Node Card (right panel)                                   */
/* ------------------------------------------------------------------ */

function SortableNodeCard({
  node,
  onSignTypeChange,
  onDelete,
  onRemoveApprover,
}: {
  node: FlowNode;
  onSignTypeChange: (id: string, value: "countersign" | "orsign") => void;
  onDelete: (id: string) => void;
  onRemoveApprover: (nodeId: string, approverId: string) => void;
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
      className="p-3 mb-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)]"
    >
      <div className="flex items-center gap-3 mb-2">
        <HolderOutlined
          {...listeners}
          style={{ cursor: "grab", color: "#999", touchAction: "none", fontSize: 16 }}
        />
        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--color-primary)] text-white text-xs flex items-center justify-center font-medium">
          {node.sort + 1}
        </span>
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
        <span className="text-xs text-[var(--text-tertiary)]">
          {node.sign_type === "countersign" ? "全部通过" : "一人通过"}
        </span>
        <div className="ml-auto">
          <Popconfirm
            title="确认删除该审批节点？"
            onConfirm={() => onDelete(node.node_id)}
          >
            <Button type="text" danger size="small" icon={<DeleteOutlined />} />
          </Popconfirm>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 pl-9">
        {node.approvers.length === 0 ? (
          <span className="text-xs text-[var(--text-tertiary)]">暂无审批人</span>
        ) : (
          node.approvers.map((emp) => (
            <Tooltip
              key={emp._id}
              title={`${emp.dept_id?.name ?? ""}${emp.dept_id?.name && emp.position ? " / " : ""}${emp.position ?? ""}`}
            >
              <div className="flex items-center gap-1.5 bg-[var(--bg-page)] rounded-full pl-1 pr-2 py-0.5 border border-[var(--border-color)]">
                <Avatar size={22} src={emp.avatar} icon={<UserOutlined />} />
                <span className="text-xs text-[var(--text-primary)] font-medium">
                  {emp.name}
                </span>
                <CloseCircleFilled
                  className="text-[10px] text-[var(--text-tertiary)] hover:text-red-500 cursor-pointer ml-0.5"
                  onClick={() => onRemoveApprover(node.node_id, emp._id)}
                />
              </div>
            </Tooltip>
          ))
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function ApprovalFlowManage() {
  const isAdmin = useAuthStore((s) => s.permissions.includes("approval_flow:manage"));

  // Data
  const [typeList, setTypeList] = useState<ReimbursementType[]>([]);
  const [flowList, setFlowList] = useState<ApprovalFlow[]>([]);
  const [typeLoading, setTypeLoading] = useState(false);

  // Selected flow for editing
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);

  // Right panel editor state
  const [editTypeCode, setEditTypeCode] = useState<string | null>(null);
  const [flowEnabled, setFlowEnabled] = useState(false);
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [saving, setSaving] = useState(false);
  const [amountMin, setAmountMin] = useState<number>(0);
  const [amountMax, setAmountMax] = useState<number | null>(null);

  // Add approver modal
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addTargetNodeId, setAddTargetNodeId] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [empLoading, setEmpLoading] = useState(false);
  const [empSearch, setEmpSearch] = useState("");
  const [addedEmpIds, setAddedEmpIds] = useState<Set<string>>(new Set());

  // Left panel search/filter
  const [flowSearch, setFlowSearch] = useState("");
  const [flowTypeFilter, setFlowTypeFilter] = useState<string | null>(null);

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

  useEffect(() => {
    fetchTypes();
    fetchFlows();
  }, [fetchTypes, fetchFlows]);

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

  /* ---- Select a flow ---- */

  const selectedFlow = flowList.find((f) => f._id === selectedFlowId) ?? null;

  const handleSelectFlow = useCallback(
    (flow: ApprovalFlow) => {
      setSelectedFlowId(flow._id);
      setEditTypeCode(flow.type_code);
      setFlowEnabled(flow.enabled);
      setAmountMin(flow.amount_min ?? 0);
      setAmountMax(flow.amount_max ?? null);
      setNodes(
        (flow.nodes ?? []).map((n, i) => {
          const approverDetails: ApproverDetail[] = Array.isArray(n.approver_ids)
            ? (n.approver_ids as unknown as ApproverDetail[]).filter(Boolean)
            : [];
          return {
            node_id: n.node_id || `node-${i}`,
            approvers: approverDetails,
            approver_ids: approverDetails.map((a) => a._id),
            sign_type: n.sign_type,
            sort: n.sort ?? i,
          };
        }),
      );
    },
    [],
  );

  /* ---- Add new flow ---- */

  const handleAddFlow = () => {
    setSelectedFlowId(null);
    setEditTypeCode(typeList[0]?.code ?? null);
    setFlowEnabled(true);
    setNodes([]);
    setAmountMin(0);
    setAmountMax(null);
  };

  /* ---- Drag end for flow cards (reorder priority) ---- */

  const onFlowDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = flowList.findIndex((f) => f._id === active.id);
    const newIndex = flowList.findIndex((f) => f._id === over.id);
    const reordered = arrayMove(flowList, oldIndex, newIndex);
    setFlowList(reordered);

    try {
      await reorderApprovalFlows(reordered.map((f) => f._id));
    } catch {
      fetchFlows();
    }
  };

  /* ---- Drag end for nodes ---- */

  const onNodeDragEnd = (event: DragEndEvent) => {
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

  const onRemoveApprover = (nodeId: string, approverId: string) => {
    setNodes((prev) =>
      prev.map((n) =>
        n.node_id === nodeId
          ? {
              ...n,
              approvers: n.approvers.filter((a) => a._id !== approverId),
              approver_ids: n.approver_ids.filter((id) => id !== approverId),
            }
          : n,
      ),
    );
  };

  const onAddNode = () => {
    const newNode: FlowNode = {
      node_id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      approvers: [],
      approver_ids: [],
      sign_type: "countersign",
      sort: nodes.length,
    };
    setNodes((prev) => [...prev, newNode]);
  };

  const openAddApprover = (nodeId: string) => {
    setAddTargetNodeId(nodeId);
    setAddedEmpIds(new Set());
    setAddModalOpen(true);
  };

  const onAddApprover = (empId: string) => {
    if (!addTargetNodeId) return;
    const emp = employees.find((e) => e._id === empId);
    if (!emp) return;

    const node = nodes.find((n) => n.node_id === addTargetNodeId);
    if (node?.approver_ids.includes(empId)) {
      message.warning("该审批人已在此节点中");
      return;
    }

    const approverDetail: ApproverDetail = {
      _id: emp._id,
      name: emp.name,
      avatar: emp.avatar || "",
      position: emp.position || "",
      dept_id: emp.dept_id?._id
        ? { _id: emp.dept_id._id, name: emp.dept_id.name }
        : { _id: "", name: "" },
    };

    setNodes((prev) =>
      prev.map((n) =>
        n.node_id === addTargetNodeId
          ? {
              ...n,
              approvers: [...n.approvers, approverDetail],
              approver_ids: [...n.approver_ids, empId],
            }
          : n,
      ),
    );
    setAddedEmpIds((prev) => new Set(prev).add(empId));
  };

  /* ---- Toggle flow enabled ---- */

  const handleToggleFlow = async (flowId: string, checked: boolean) => {
    try {
      await toggleApprovalFlow(flowId);
      setFlowList((prev) =>
        prev.map((f) => (f._id === flowId ? { ...f, enabled: checked } : f)),
      );
      if (selectedFlowId === flowId) setFlowEnabled(checked);
      message.success(checked ? "审批流已启用" : "审批流已禁用");
    } catch {
      // Error handled by interceptor
    }
  };

  /* ---- Delete flow ---- */

  const handleDeleteFlow = async (flowId: string) => {
    try {
      await deleteApprovalFlow(flowId);
      setFlowList((prev) => prev.filter((f) => f._id !== flowId));
      if (selectedFlowId === flowId) {
        setSelectedFlowId(null);
        setNodes([]);
      }
      message.success("审批流已删除");
    } catch {
      // Error handled by interceptor
    }
  };

  /* ---- Save ---- */

  const handleSave = async () => {
    if (!editTypeCode) {
      message.warning("请选择报销类型");
      return;
    }
    if (nodes.length === 0) {
      message.warning("请至少添加一个审批节点");
      return;
    }
    for (const node of nodes) {
      if (node.approver_ids.length === 0) {
        message.warning("每个审批节点至少需要一个审批人");
        return;
      }
    }
    if (amountMin == null) {
      message.warning("请填写最低金额");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        type_code: editTypeCode,
        enabled: flowEnabled,
        amount_min: amountMin,
        amount_max: amountMax ?? undefined,
        nodes: nodes.map((n) => ({
          node_id: n.node_id,
          approver_ids: n.approver_ids,
          sign_type: n.sign_type,
          sort: n.sort,
        })),
      };

      if (selectedFlow) {
        await updateApprovalFlow(selectedFlow._id, payload);
        message.success("审批流更新成功");
      } else {
        const res = await createApprovalFlow(payload);
        if (res?.id) setSelectedFlowId(res.id);
        message.success("审批流创建成功");
      }
      fetchFlows();
    } catch {
      // Interceptor handles error messages
    } finally {
      setSaving(false);
    }
  };

  /* ---- Helpers ---- */

  const getTypeLabel = (code: string) =>
    typeList.find((t) => t.code === code)?.label ?? code;

  // Filtered flow list for left panel
  const isFiltered = !!(flowSearch || flowTypeFilter);
  const filteredFlows = flowList.filter((f) => {
    if (flowTypeFilter && f.type_code !== flowTypeFilter) return false;
    if (flowSearch) {
      const label = getTypeLabel(f.type_code).toLowerCase();
      const code = f.type_code.toLowerCase();
      const q = flowSearch.toLowerCase();
      if (!label.includes(q) && !code.includes(q)) return false;
    }
    return true;
  });

  /* ---- Render ---- */

  return (
    <div className="w-full">
      <Row gutter={16}>
        {/* ---- Left panel: flow card list ---- */}
        <Col xs={24} md={8}>
          <Card
            title="审批流列表"
            className="h-full"
            bodyStyle={{ padding: "12px" }}
            extra={
              <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleAddFlow}>
                新增审批流
              </Button>
            }
          >
            {/* Search & filter */}
            <div className="flex flex-col gap-2 mb-3">
              <Input
                size="small"
                placeholder="搜索审批流"
                allowClear
                value={flowSearch}
                onChange={(e) => setFlowSearch(e.target.value)}
              />
              <Select
                size="small"
                value={flowTypeFilter}
                onChange={setFlowTypeFilter}
                allowClear
                placeholder="按报销类型筛选"
                style={{ width: "100%" }}
                options={typeList.map((t) => ({
                  label: t.label,
                  value: t.code,
                }))}
              />
            </div>
            <Spin spinning={typeLoading}>
              {filteredFlows.length === 0 ? (
                <Empty
                  description="暂无审批流，点击上方按钮新增"
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  className="py-8"
                />
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={isFiltered ? undefined : onFlowDragEnd}
                >
                  <SortableContext
                    items={filteredFlows.map((f) => f._id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {filteredFlows.map((flow) => (
                      <SortableFlowCard
                        key={flow._id}
                        flow={flow}
                        typeLabel={getTypeLabel(flow.type_code)}
                        isSelected={selectedFlowId === flow._id}
                        onSelect={() => handleSelectFlow(flow)}
                        onToggle={(checked) => handleToggleFlow(flow._id, checked)}
                        onDelete={() => handleDeleteFlow(flow._id)}
                        showHandle={!isFiltered}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              )}
            </Spin>
          </Card>
        </Col>

        {/* ---- Right panel: flow editor ---- */}
        <Col xs={24} md={16}>
          <Card title={selectedFlow ? "编辑审批流" : "新增审批流"} className="h-full">
            <div>
              {/* Top: type selector + enable switch + amount range */}
              <div className="flex flex-wrap items-center gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-[var(--text-secondary)]">
                    报销类型:
                  </span>
                  <Select
                    size="small"
                    value={editTypeCode}
                    onChange={setEditTypeCode}
                    style={{ width: 160 }}
                    placeholder="选择类型"
                    options={typeList.map((t) => ({
                      label: t.label,
                      value: t.code,
                    }))}
                  />
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-[var(--text-secondary)]">
                      启用:
                    </span>
                    <Switch
                      checked={flowEnabled}
                      onChange={setFlowEnabled}
                    />
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-[var(--text-secondary)]">
                    金额范围:
                  </span>
                  <InputNumber
                    size="small"
                    min={0}
                    placeholder="最低"
                    value={amountMin}
                    onChange={(v) => setAmountMin(v ?? 0)}
                    style={{ width: 100 }}
                    addonAfter="元"
                  />
                  <span className="text-[var(--text-tertiary)]">~</span>
                  <InputNumber
                    size="small"
                    min={0}
                    placeholder="不限"
                    value={amountMax}
                    onChange={(v) => setAmountMax(v)}
                    style={{ width: 100 }}
                    addonAfter="元"
                  />
                </div>
              </div>

              {/* DnD area */}
              <div className="min-h-[120px] mb-4">
                {nodes.length === 0 ? (
                  <div className="flex items-center justify-center py-10 border border-dashed border-[var(--border-color)] rounded-lg text-[var(--text-tertiary)] text-sm">
                    暂无审批节点，请点击下方按钮添加
                  </div>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={onNodeDragEnd}
                  >
                    <SortableContext
                      items={nodes.map((n) => n.node_id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {nodes.map((node) => (
                        <div key={node.node_id}>
                          <SortableNodeCard
                            node={node}
                            onSignTypeChange={onSignTypeChange}
                            onDelete={onDeleteNode}
                            onRemoveApprover={onRemoveApprover}
                          />
                          <div className="pl-9 mb-2">
                            <Button
                              type="dashed"
                              size="small"
                              icon={<PlusOutlined />}
                              onClick={() => openAddApprover(node.node_id)}
                            >
                              添加审批人
                            </Button>
                          </div>
                        </div>
                      ))}
                    </SortableContext>
                  </DndContext>
                )}
              </div>

              {/* Bottom: add node + save */}
              <div className="flex items-center gap-3 flex-wrap">
                <Button
                  icon={<PlusOutlined />}
                  onClick={onAddNode}
                >
                  添加审批节点
                </Button>
                <Button type="primary" loading={saving} onClick={handleSave}>
                  保存
                </Button>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* ---- Add Approver Modal ---- */}
      <Modal
        title="选择审批人"
        open={addModalOpen}
        onCancel={() => {
          setAddModalOpen(false);
          setAddTargetNodeId(null);
        }}
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
            renderItem={(emp) => {
              const isAdded = addedEmpIds.has(emp._id);
              return (
                <List.Item
                  style={{
                    cursor: "pointer",
                    padding: "10px 12px",
                    background: isAdded ? "#f6ffed" : undefined,
                    borderLeft: isAdded ? "3px solid #52c41a" : undefined,
                    transition: "all 0.2s",
                  }}
                  onClick={() => {
                    if (!isAdded) onAddApprover(emp._id);
                  }}
                >
                  <List.Item.Meta
                    avatar={
                      <Avatar
                        src={emp.avatar}
                        icon={<UserOutlined />}
                        size={40}
                      />
                    }
                    title={
                      <div className="flex items-center gap-2">
                        {isAdded && <CheckCircleFilled className="text-green-500 text-sm" />}
                        <span>{emp.name}</span>
                      </div>
                    }
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
              );
            }}
          />
        </Spin>
      </Modal>
    </div>
  );
}

import { useState, useEffect } from "react";
import {
  Card,
  Form,
  Input,
  Switch,
  Button,
  Table,
  Select,
  InputNumber,
  message,
  Popconfirm,
  Modal,
  Tag,
  Descriptions,
} from "antd";
import {
  PlusOutlined,
  DeleteOutlined,
  PlusCircleOutlined,
  MinusCircleOutlined,
  HolderOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import {
  createReimbursementType,
  deleteReimbursementType,
  updateReimbursementType,
} from "../api/reimbursementType";
import type {
  TypeFieldPayload,
  FieldOption,
  ExportFieldPayload,
} from "../api/reimbursementType";
import { getReimbursementTypes } from "../api/reimbursement";
import type { ReimbursementType } from "../api/reimbursement";
import { useAIStore } from "../store/useAIStore";
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

const { TextArea } = Input;

interface FieldRow extends TypeFieldPayload {
  _rowKey: string;
}

interface ExportFieldRow extends ExportFieldPayload {
  _rowKey: string;
}

interface PendingCreateType {
  tempId: string;
  payload: {
    code: string;
    name: string;
    label: string;
    remark?: string;
    formula?: string;
    over_limit_threshold?: number;
    status: 0 | 1;
    fields: TypeFieldPayload[];
    export_fields: ExportFieldPayload[];
  };
}

const newFieldRow = (): FieldRow => ({
  _rowKey: Date.now().toString() + Math.random(),
  key: "",
  label: "",
  type: "text",
  required: false,
  sort: 0,
  options: [],
});

const newExportFieldRow = (): ExportFieldRow => ({
  _rowKey: Date.now().toString() + Math.random(),
  key: "",
  label: "",
  sort: 0,
  formula: "",
});

import { createContext, useContext } from "react";

interface RowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  "data-row-key": string;
}

// 用 context 把拖拽 listeners 传给图标列
const DragHandleContext = createContext<React.HTMLAttributes<HTMLElement>>({});

export function DragHandle() {
  const listeners = useContext(DragHandleContext);
  return (
    <HolderOutlined
      {...listeners}
      style={{ cursor: "grab", color: "#999", touchAction: "none" }}
    />
  );
}

const DraggableRow = ({ children, ...props }: RowProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: props["data-row-key"],
  });
  const style: React.CSSProperties = {
    ...props.style,
    transform: CSS.Transform.toString(transform && { ...transform, scaleY: 1 }),
    transition,
    ...(isDragging ? { position: "relative", zIndex: 1 } : {}),
  };
  return (
    <DragHandleContext.Provider value={listeners ?? {}}>
      <tr {...props} ref={setNodeRef} style={style} {...attributes}>
        {children}
      </tr>
    </DragHandleContext.Provider>
  );
};

// 导出字段表格（新建/编辑复用，支持拖拽排序）
function ExportFieldTable({
  exportFields,
  setExportFields,
  numberFields,
}: {
  exportFields: ExportFieldRow[];
  setExportFields: React.Dispatch<React.SetStateAction<ExportFieldRow[]>>;
  numberFields: { key: string; label: string }[];
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 1 } }),
  );

  const update = (rowKey: string, patch: Partial<ExportFieldRow>) =>
    setExportFields((prev) =>
      prev.map((f) => (f._rowKey === rowKey ? { ...f, ...patch } : f)),
    );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setExportFields((prev) => {
        const oldIndex = prev.findIndex((f) => f._rowKey === active.id);
        const newIndex = prev.findIndex((f) => f._rowKey === over.id);
        return arrayMove(prev, oldIndex, newIndex).map((f, i) => ({
          ...f,
          sort: i,
        }));
      });
    }
  };

  const columns = [
    {
      title: "",
      width: 40,
      render: () => <DragHandle />,
    },
    {
      title: "字段标识符",
      width: 130,
      render: (_: unknown, row: ExportFieldRow) => (
        <Input
          size="small"
          placeholder="对应表单字段 key"
          value={row.key}
          onChange={(e) => update(row._rowKey, { key: e.target.value })}
        />
      ),
    },
    {
      title: "导出列名",
      width: 130,
      render: (_: unknown, row: ExportFieldRow) => (
        <Input
          size="small"
          placeholder="Excel 列标题"
          value={row.label}
          onChange={(e) => update(row._rowKey, { label: e.target.value })}
        />
      ),
    },
    {
      title: "参与计算字段",
      render: (_: unknown, row: ExportFieldRow) => (
        <Select
          size="small"
          mode="multiple"
          className="w-full"
          placeholder="选择参与计算的数字字段"
          value={
            (row as ExportFieldRow & { calc_fields?: string[] }).calc_fields ??
            []
          }
          onChange={(v: string[]) =>
            update(row._rowKey, { calc_fields: v } as Partial<ExportFieldRow>)
          }
          options={numberFields.map((f) => ({
            label: `${f.label}（${f.key}）`,
            value: f.key,
          }))}
          allowClear
        />
      ),
    },
    {
      title: "计算公式",
      width: 160,
      render: (_: unknown, row: ExportFieldRow) => (
        <Input
          size="small"
          placeholder="如 quantity * unit_price"
          value={row.formula ?? ""}
          onChange={(e) => update(row._rowKey, { formula: e.target.value })}
        />
      ),
    },
    {
      title: "操作",
      width: 60,
      render: (_: unknown, row: ExportFieldRow) => (
        <Popconfirm
          title="确认删除该导出字段？"
          onConfirm={() =>
            setExportFields((p) => p.filter((f) => f._rowKey !== row._rowKey))
          }
        >
          <Button type="text" danger size="small" icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <>
      <div className="overflow-x-auto">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={exportFields.map((f) => f._rowKey)}
            strategy={verticalListSortingStrategy}
          >
            <Table
              dataSource={exportFields}
              rowKey="_rowKey"
              columns={columns}
              pagination={false}
              size="small"
              components={{ body: { row: DraggableRow } }}
              locale={{ emptyText: "暂无导出字段，点击下方按钮添加" }}
            />
          </SortableContext>
        </DndContext>
      </div>
      <Button
        type="dashed"
        icon={<PlusOutlined />}
        className="w-full mt-3"
        onClick={() => setExportFields((p) => [...p, newExportFieldRow()])}
      >
        添加导出字段
      </Button>
    </>
  );
}

export default function ReimbursementTypeCreate() {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [fields, setFields] = useState<FieldRow[]>([]);
  const [exportFields, setExportFields] = useState<ExportFieldRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [pendingCreateTypes, setPendingCreateTypes] = useState<PendingCreateType[]>(
    [],
  );

  const [typeList, setTypeList] = useState<ReimbursementType[]>([]);
  const [typeLoading, setTypeLoading] = useState(false);
  const [detailType, setDetailType] = useState<ReimbursementType | null>(null);

  const [editType, setEditType] = useState<ReimbursementType | null>(null);
  const [editForm] = Form.useForm();
  const [editFields, setEditFields] = useState<FieldRow[]>([]);
  const [editExportFields, setEditExportFields] = useState<ExportFieldRow[]>(
    [],
  );
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [pendingEditTypeId, setPendingEditTypeId] = useState<string | null>(null);
  const [pendingEditFields, setPendingEditFields] = useState<FieldRow[]>([]);
  const [pendingEditExportFields, setPendingEditExportFields] = useState<
    ExportFieldRow[]
  >([]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 1 } }),
  );

  const fetchTypes = () => {
    setTypeLoading(true);
    getReimbursementTypes()
      .then((data) => setTypeList(data ?? []))
      .catch(() => {})
      .finally(() => setTypeLoading(false));
  };

  useEffect(() => {
    fetchTypes();
  }, []);

  const toCreatePayload = (
    draft: {
      code: string;
      name: string;
      label: string;
      remark?: string;
      formula?: string;
      over_limit_threshold?: number;
      fields: TypeFieldPayload[];
      export_fields?: ExportFieldPayload[];
    },
    enabled = true,
  ) => ({
    code: draft.code,
    name: draft.name,
    label: draft.label,
    remark: draft.remark,
    formula: draft.formula || undefined,
    over_limit_threshold: draft.over_limit_threshold ?? undefined,
    status: enabled ? (1 as const) : (0 as const),
    fields: draft.fields,
    export_fields: draft.export_fields ?? [],
  });

  // 读取 AI 生成的草稿并填入表单（支持单条/多条），仅渲染到待提交列表，不自动创建
  const { reimbursementTypeDraft, clearReimbursementTypeDraft } = useAIStore();
  useEffect(() => {
    if (!reimbursementTypeDraft) return;
    const drafts = reimbursementTypeDraft;
    const payload = drafts.map((d) =>
      toCreatePayload({
        code: d.code,
        name: d.name,
        label: d.label,
        formula: d.formula,
        over_limit_threshold: d.over_limit_threshold,
        fields: d.fields ?? [],
        export_fields: d.export_fields ?? [],
      }),
    );
    setPendingCreateTypes((prev) => [
      ...prev,
      ...payload.map((p) => ({ tempId: `${Date.now()}-${Math.random()}`, payload: p })),
    ]);
    const one = drafts[0];
    form.setFieldsValue({
      code: one.code,
      name: one.name,
      label: one.label,
      formula: one.formula ?? "",
      over_limit_threshold: one.over_limit_threshold,
      enabled: true,
    });
    setFields(
      (one.fields ?? []).map((f) => ({
        ...f,
        options: f.options ?? [],
        _rowKey: Date.now().toString() + Math.random(),
      })),
    );
    setExportFields(
      (one.export_fields ?? []).map((f) => ({
        ...f,
        _rowKey: Date.now().toString() + Math.random(),
      })),
    );
    message.success(
      drafts.length > 1
        ? `AI 生成的 ${drafts.length} 个报销类型已加入待提交列表`
        : "AI 已为您填入报销类型配置，并加入待提交列表",
    );
    clearReimbursementTypeDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reimbursementTypeDraft]);

  // 新建表单 - 字段操作
  const updateField = (rowKey: string, patch: Partial<FieldRow>) =>
    setFields((prev) =>
      prev.map((f) => (f._rowKey === rowKey ? { ...f, ...patch } : f)),
    );

  const addOption = (rowKey: string) =>
    setFields((prev) =>
      prev.map((f) =>
        f._rowKey === rowKey
          ? { ...f, options: [...f.options, { label: "", value: "" }] }
          : f,
      ),
    );

  const updateOption = (
    rowKey: string,
    idx: number,
    patch: Partial<FieldOption>,
  ) =>
    setFields((prev) =>
      prev.map((f) =>
        f._rowKey === rowKey
          ? {
              ...f,
              options: f.options.map((o, i) =>
                i === idx ? { ...o, ...patch } : o,
              ),
            }
          : f,
      ),
    );

  const removeOption = (rowKey: string, idx: number) =>
    setFields((prev) =>
      prev.map((f) =>
        f._rowKey === rowKey
          ? { ...f, options: f.options.filter((_, i) => i !== idx) }
          : f,
      ),
    );

  // 编辑弹窗 - 字段操作
  const updateEditField = (rowKey: string, patch: Partial<FieldRow>) =>
    setEditFields((prev) =>
      prev.map((f) => (f._rowKey === rowKey ? { ...f, ...patch } : f)),
    );

  const addEditOption = (rowKey: string) =>
    setEditFields((prev) =>
      prev.map((f) =>
        f._rowKey === rowKey
          ? { ...f, options: [...f.options, { label: "", value: "" }] }
          : f,
      ),
    );

  const updateEditOption = (
    rowKey: string,
    idx: number,
    patch: Partial<FieldOption>,
  ) =>
    setEditFields((prev) =>
      prev.map((f) =>
        f._rowKey === rowKey
          ? {
              ...f,
              options: f.options.map((o, i) =>
                i === idx ? { ...o, ...patch } : o,
              ),
            }
          : f,
      ),
    );

  const removeEditOption = (rowKey: string, idx: number) =>
    setEditFields((prev) =>
      prev.map((f) =>
        f._rowKey === rowKey
          ? { ...f, options: f.options.filter((_, i) => i !== idx) }
          : f,
      ),
    );

  const openEditModal = (record: ReimbursementType) => {
    setEditType(record);
    editForm.setFieldsValue({
      code: record.code,
      name: record.name,
      label: record.label,
      formula: record.formula ?? "",
      over_limit_threshold:
        (record as unknown as { over_limit_threshold?: number })
          .over_limit_threshold ?? null,
      status: ((record as unknown as { status?: number }).status ?? 1) === 1,
    });
    setEditFields(
      (record.fields ?? []).map((f) => ({
        ...f,
        _rowKey: Date.now().toString() + Math.random(),
      })),
    );
    // 加载已有导出字段
    const ef =
      (record as unknown as { export_fields?: ExportFieldPayload[] })
        .export_fields ?? [];
    setEditExportFields(
      ef.map((f) => ({ ...f, _rowKey: Date.now().toString() + Math.random() })),
    );
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setEditFields((prev) => {
        const oldIndex = prev.findIndex((item) => item._rowKey === active.id);
        const newIndex = prev.findIndex((item) => item._rowKey === over.id);
        return arrayMove(prev, oldIndex, newIndex).map((item, index) => ({
          ...item,
          sort: index,
        }));
      });
    }
  };

  const validateFields = (fs: FieldRow[]) => {
    for (const f of fs) {
      if (!f.key.trim() || !f.label.trim()) {
        message.warning("请填写所有字段的标识符和名称");
        return false;
      }
      if (f.type === "select" && f.options.length === 0) {
        message.warning(`字段「${f.label}」类型为下拉，请至少添加一个选项`);
        return false;
      }
    }
    return true;
  };

  const validateExportFields = (efs: ExportFieldRow[]) => {
    for (const f of efs) {
      if (!f.key.trim() || !f.label.trim()) {
        message.warning("请填写所有导出字段的标识符和列名");
        return false;
      }
    }
    return true;
  };

  const onAddPendingType = async (values: {
    code: string;
    name: string;
    label: string;
    remark?: string;
    formula?: string;
    over_limit_threshold?: number;
    enabled: boolean;
  }) => {
    const code = values.code.trim();
    const name = values.name.trim();
    const label = values.label.trim();
    if (typeList.find((t) => t.code === code)) {
      message.warning(`类型标识符「${values.code}」已存在`);
      return;
    }
    if (typeList.find((t) => t.name === name)) {
      message.warning(`报销类型「${values.name}」已存在`);
      return;
    }
    if (pendingCreateTypes.find((x) => x.payload.code === code)) {
      message.warning(`待提交列表中已存在类型标识符「${code}」`);
      return;
    }
    if (pendingCreateTypes.find((x) => x.payload.name === name)) {
      message.warning(`待提交列表中已存在报销类型「${name}」`);
      return;
    }
    if (!validateFields(fields)) return;
    if (!validateExportFields(exportFields)) return;

    setPendingCreateTypes((prev) => [
      ...prev,
      {
        tempId: `${Date.now()}-${Math.random()}`,
        payload: {
          code,
          name,
          label,
          remark: values.remark,
          formula: values.formula || undefined,
          over_limit_threshold: values.over_limit_threshold ?? undefined,
          status: values.enabled ? 1 : 0,
          fields: fields.map(({ _rowKey, ...rest }) => rest),
          export_fields: exportFields.map(({ _rowKey, ...rest }) => rest),
        },
      },
    ]);
    message.success(`已添加「${name}」到待提交列表`);
    form.resetFields();
    form.setFieldValue("enabled", true);
    setFields([]);
    setExportFields([]);
  };

  const onBatchCreate = async () => {
    if (pendingCreateTypes.length === 0) {
      message.warning("请先添加至少一个报销类型到待提交列表");
      return;
    }
    setSubmitting(true);
    try {
      await createReimbursementType(pendingCreateTypes.map((x) => x.payload));
      message.success(`成功创建 ${pendingCreateTypes.length} 个报销类型`);
      setPendingCreateTypes([]);
      fetchTypes();
    } catch {
      // 拦截器统一提示
    } finally {
      setSubmitting(false);
    }
  };

  const openPendingFieldsEditor = (tempId: string) => {
    const item = pendingCreateTypes.find((x) => x.tempId === tempId);
    if (!item) return;
    setPendingEditTypeId(tempId);
    setPendingEditFields(
      (item.payload.fields ?? []).map((f) => ({
        ...f,
        options: f.options ?? [],
        _rowKey: `${Date.now()}-${Math.random()}`,
      })),
    );
    setPendingEditExportFields(
      (item.payload.export_fields ?? []).map((f) => ({
        ...f,
        _rowKey: `${Date.now()}-${Math.random()}`,
      })),
    );
  };

  const updatePendingEditField = (rowKey: string, patch: Partial<FieldRow>) =>
    setPendingEditFields((prev) =>
      prev.map((f) => (f._rowKey === rowKey ? { ...f, ...patch } : f)),
    );

  const addPendingEditOption = (rowKey: string) =>
    setPendingEditFields((prev) =>
      prev.map((f) =>
        f._rowKey === rowKey
          ? { ...f, options: [...f.options, { label: "", value: "" }] }
          : f,
      ),
    );

  const updatePendingEditOption = (
    rowKey: string,
    idx: number,
    patch: Partial<FieldOption>,
  ) =>
    setPendingEditFields((prev) =>
      prev.map((f) =>
        f._rowKey === rowKey
          ? {
              ...f,
              options: f.options.map((o, i) =>
                i === idx ? { ...o, ...patch } : o,
              ),
            }
          : f,
      ),
    );

  const removePendingEditOption = (rowKey: string, idx: number) =>
    setPendingEditFields((prev) =>
      prev.map((f) =>
        f._rowKey === rowKey
          ? { ...f, options: f.options.filter((_, i) => i !== idx) }
          : f,
      ),
    );

  const pendingEditExpandedRowRender = (row: FieldRow) => {
    if (row.type !== "select") return null;
    return (
      <div className="py-2 px-4 bg-[var(--bg-page)] rounded-lg">
        <p className="text-xs text-[var(--text-secondary)] mb-2">选项配置</p>
        {row.options.map((opt, idx) => (
          <div key={idx} className="flex gap-2 mb-2 items-center">
            <Input
              size="small"
              placeholder="选项名称"
              value={opt.label}
              onChange={(e) =>
                updatePendingEditOption(row._rowKey, idx, {
                  label: e.target.value,
                })
              }
            />
            <Input
              size="small"
              placeholder="选项值"
              value={opt.value}
              onChange={(e) =>
                updatePendingEditOption(row._rowKey, idx, {
                  value: e.target.value,
                })
              }
            />
            <Button
              type="text"
              danger
              size="small"
              icon={<MinusCircleOutlined />}
              onClick={() => removePendingEditOption(row._rowKey, idx)}
            />
          </div>
        ))}
        <Button
          type="dashed"
          size="small"
          icon={<PlusCircleOutlined />}
          onClick={() => addPendingEditOption(row._rowKey)}
        >
          添加选项
        </Button>
      </div>
    );
  };

  const pendingEditFieldColumns = [
    {
      title: "字段标识符",
      width: 140,
      render: (_: unknown, row: FieldRow) => (
        <Input
          size="small"
          placeholder="英文，如 itemName"
          value={row.key}
          onChange={(e) =>
            updatePendingEditField(row._rowKey, { key: e.target.value })
          }
        />
      ),
    },
    {
      title: "字段名称",
      width: 130,
      render: (_: unknown, row: FieldRow) => (
        <Input
          size="small"
          placeholder="中文展示名"
          value={row.label}
          onChange={(e) =>
            updatePendingEditField(row._rowKey, { label: e.target.value })
          }
        />
      ),
    },
    {
      title: "字段类型",
      width: 120,
      render: (_: unknown, row: FieldRow) => (
        <Select
          size="small"
          value={row.type}
          onChange={(v) =>
            updatePendingEditField(row._rowKey, { type: v, options: [] })
          }
          options={[
            { label: "文本", value: "text" },
            { label: "数字", value: "number" },
            { label: "日期", value: "date" },
            { label: "下拉", value: "select" },
            { label: "多行文本", value: "textarea" },
          ]}
        />
      ),
    },
    {
      title: "必填",
      width: 60,
      render: (_: unknown, row: FieldRow) => (
        <Switch
          size="small"
          checked={row.required}
          onChange={(v) => updatePendingEditField(row._rowKey, { required: v })}
        />
      ),
    },
    {
      title: "参与计算",
      width: 70,
      render: (_: unknown, row: FieldRow) => (
        <Switch
          size="small"
          checked={
            (row as FieldRow & { is_calculate?: boolean }).is_calculate ?? false
          }
          onChange={(v) =>
            updatePendingEditField(
              row._rowKey,
              { is_calculate: v } as Partial<FieldRow>,
            )
          }
        />
      ),
    },
    {
      title: "排序",
      width: 80,
      render: (_: unknown, row: FieldRow) => (
        <InputNumber
          size="small"
          min={0}
          value={row.sort}
          onChange={(v) => updatePendingEditField(row._rowKey, { sort: v ?? 0 })}
        />
      ),
    },
    {
      title: "操作",
      width: 60,
      render: (_: unknown, row: FieldRow) => (
        <Button
          type="text"
          danger
          size="small"
          icon={<DeleteOutlined />}
          onClick={() =>
            setPendingEditFields((prev) => prev.filter((f) => f._rowKey !== row._rowKey))
          }
        />
      ),
    },
  ];

  const savePendingFieldsEditor = () => {
    if (!pendingEditTypeId) return;
    if (!validateFields(pendingEditFields)) return;
    if (!validateExportFields(pendingEditExportFields)) return;
    updatePendingType(pendingEditTypeId, {
      fields: pendingEditFields.map(({ _rowKey, ...rest }) => rest),
      export_fields: pendingEditExportFields.map(({ _rowKey, ...rest }) => rest),
    });
    setPendingEditTypeId(null);
    setPendingEditFields([]);
    setPendingEditExportFields([]);
    message.success("字段与导出字段已更新");
  };

  const updatePendingType = (
    tempId: string,
    patch: Partial<PendingCreateType["payload"]>,
  ) => {
    setPendingCreateTypes((prev) =>
      prev.map((item) =>
        item.tempId === tempId
          ? {
              ...item,
              payload: { ...item.payload, ...patch },
            }
          : item,
      ),
    );
  };

  const onEditFinish = async (values: {
    code: string;
    name: string;
    label: string;
    formula?: string;
    over_limit_threshold?: number;
    status: boolean;
  }) => {
    if (!editType) return;
    if (!validateFields(editFields)) return;
    if (!validateExportFields(editExportFields)) return;

    setEditSubmitting(true);
    try {
      await updateReimbursementType(editType._id, {
        code: values.code,
        name: values.name,
        label: values.label,
        formula: values.formula || undefined,
        over_limit_threshold: values.over_limit_threshold ?? undefined,
        status: values.status ? 1 : 0,
        fields: editFields.map(({ _rowKey, ...rest }) => rest),
        export_fields: editExportFields.map(({ _rowKey, ...rest }) => rest),
      });
      message.success("报销类型更新成功");
      setEditType(null);
      editForm.resetFields();
      setEditFields([]);
      setEditExportFields([]);
      fetchTypes();
    } catch {
      // 拦截器统一提示
    } finally {
      setEditSubmitting(false);
    }
  };

  // 新建表单 - 字段配置列
  const fieldColumns = [
    {
      title: "字段标识符",
      width: 140,
      render: (_: unknown, row: FieldRow) => (
        <Input
          size="small"
          placeholder="英文，如 itemName"
          value={row.key}
          onChange={(e) => updateField(row._rowKey, { key: e.target.value })}
        />
      ),
    },
    {
      title: "字段名称",
      width: 130,
      render: (_: unknown, row: FieldRow) => (
        <Input
          size="small"
          placeholder="中文展示名"
          value={row.label}
          onChange={(e) => updateField(row._rowKey, { label: e.target.value })}
        />
      ),
    },
    {
      title: "字段类型",
      width: 120,
      render: (_: unknown, row: FieldRow) => (
        <Select
          size="small"
          value={row.type}
          onChange={(v) => updateField(row._rowKey, { type: v, options: [] })}
          options={[
            { label: "文本", value: "text" },
            { label: "数字", value: "number" },
            { label: "日期", value: "date" },
            { label: "下拉", value: "select" },
            { label: "多行文本", value: "textarea" },
          ]}
        />
      ),
    },
    {
      title: "必填",
      width: 60,
      render: (_: unknown, row: FieldRow) => (
        <Switch
          size="small"
          checked={row.required}
          onChange={(v) => updateField(row._rowKey, { required: v })}
        />
      ),
    },
    {
      title: "参与计算",
      width: 70,
      render: (_: unknown, row: FieldRow) => (
        <Switch
          size="small"
          checked={
            (row as FieldRow & { is_calculate?: boolean }).is_calculate ?? false
          }
          onChange={(v) =>
            updateField(row._rowKey, { is_calculate: v } as Partial<FieldRow>)
          }
        />
      ),
    },
    {
      title: "排序",
      width: 80,
      render: (_: unknown, row: FieldRow) => (
        <InputNumber
          size="small"
          min={0}
          value={row.sort}
          onChange={(v) => updateField(row._rowKey, { sort: v ?? 0 })}
        />
      ),
    },
    {
      title: "操作",
      width: 60,
      render: (_: unknown, row: FieldRow) => (
        <Popconfirm
          title="确认删除该字段？"
          onConfirm={() => {
            setFields((p) => p.filter((f) => f._rowKey !== row._rowKey));
            // 同步清理 export_fields 中 calc_fields 引用了该 key 的项，以及 key 相同的导出字段
            if (row.key) {
              setExportFields((prev) =>
                prev
                  .filter((ef) => ef.key !== row.key)
                  .map((ef) => ({
                    ...ef,
                    calc_fields: (
                      ef as ExportFieldRow & { calc_fields?: string[] }
                    ).calc_fields?.filter((k) => k !== row.key),
                  })),
              );
            }
          }}
        >
          <Button type="text" danger size="small" icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  const expandedRowRender = (row: FieldRow) => {
    if (row.type !== "select") return null;
    return (
      <div className="py-2 px-4 bg-[var(--bg-page)] rounded-lg">
        <p className="text-xs text-[var(--text-secondary)] mb-2">选项配置</p>
        {row.options.map((opt, idx) => (
          <div key={idx} className="flex gap-2 mb-2 items-center">
            <Input
              size="small"
              placeholder="选项名称"
              value={opt.label}
              onChange={(e) =>
                updateOption(row._rowKey, idx, { label: e.target.value })
              }
            />
            <Input
              size="small"
              placeholder="选项值"
              value={opt.value}
              onChange={(e) =>
                updateOption(row._rowKey, idx, { value: e.target.value })
              }
            />
            <Button
              type="text"
              danger
              size="small"
              icon={<MinusCircleOutlined />}
              onClick={() => removeOption(row._rowKey, idx)}
            />
          </div>
        ))}
        <Button
          type="dashed"
          size="small"
          icon={<PlusCircleOutlined />}
          onClick={() => addOption(row._rowKey)}
        >
          添加选项
        </Button>
      </div>
    );
  };

  // 编辑弹窗 - 字段配置列（带拖拽）
  const editFieldColumns = [
    { title: "", width: 40, render: () => <DragHandle /> },
    {
      title: "字段标识符",
      width: 140,
      render: (_: unknown, row: FieldRow) => (
        <Input
          size="small"
          placeholder="英文，如 itemName"
          value={row.key}
          onChange={(e) =>
            updateEditField(row._rowKey, { key: e.target.value })
          }
        />
      ),
    },
    {
      title: "字段名称",
      width: 130,
      render: (_: unknown, row: FieldRow) => (
        <Input
          size="small"
          placeholder="中文展示名"
          value={row.label}
          onChange={(e) =>
            updateEditField(row._rowKey, { label: e.target.value })
          }
        />
      ),
    },
    {
      title: "字段类型",
      width: 120,
      render: (_: unknown, row: FieldRow) => (
        <Select
          size="small"
          value={row.type}
          onChange={(v) =>
            updateEditField(row._rowKey, { type: v, options: [] })
          }
          options={[
            { label: "文本", value: "text" },
            { label: "数字", value: "number" },
            { label: "日期", value: "date" },
            { label: "下拉", value: "select" },
            { label: "多行文本", value: "textarea" },
          ]}
        />
      ),
    },
    {
      title: "必填",
      width: 60,
      render: (_: unknown, row: FieldRow) => (
        <Switch
          size="small"
          checked={row.required}
          onChange={(v) => updateEditField(row._rowKey, { required: v })}
        />
      ),
    },
    {
      title: "参与计算",
      width: 70,
      render: (_: unknown, row: FieldRow) => (
        <Switch
          size="small"
          checked={
            (row as FieldRow & { is_calculate?: boolean }).is_calculate ?? false
          }
          onChange={(v) =>
            updateEditField(row._rowKey, {
              is_calculate: v,
            } as Partial<FieldRow>)
          }
        />
      ),
    },
    {
      title: "排序",
      width: 80,
      render: (_: unknown, row: FieldRow) => (
        <InputNumber
          size="small"
          min={0}
          value={row.sort}
          onChange={(v) => updateEditField(row._rowKey, { sort: v ?? 0 })}
        />
      ),
    },
    {
      title: "操作",
      width: 60,
      render: (_: unknown, row: FieldRow) => (
        <Popconfirm
          title="确认删除该字段？"
          onConfirm={() => {
            setEditFields((p) => p.filter((f) => f._rowKey !== row._rowKey));
            if (row.key) {
              setEditExportFields((prev) =>
                prev
                  .filter((ef) => ef.key !== row.key)
                  .map((ef) => ({
                    ...ef,
                    calc_fields: (
                      ef as ExportFieldRow & { calc_fields?: string[] }
                    ).calc_fields?.filter((k) => k !== row.key),
                  })),
              );
            }
          }}
        >
          <Button type="text" danger size="small" icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  const editExpandedRowRender = (row: FieldRow) => {
    if (row.type !== "select") return null;
    return (
      <div className="py-2 px-4 bg-[var(--bg-page)] rounded-lg">
        <p className="text-xs text-[var(--text-secondary)] mb-2">选项配置</p>
        {row.options.map((opt, idx) => (
          <div key={idx} className="flex gap-2 mb-2 items-center">
            <Input
              size="small"
              placeholder="选项名称"
              value={opt.label}
              onChange={(e) =>
                updateEditOption(row._rowKey, idx, { label: e.target.value })
              }
            />
            <Input
              size="small"
              placeholder="选项值"
              value={opt.value}
              onChange={(e) =>
                updateEditOption(row._rowKey, idx, { value: e.target.value })
              }
            />
            <Button
              type="text"
              danger
              size="small"
              icon={<MinusCircleOutlined />}
              onClick={() => removeEditOption(row._rowKey, idx)}
            />
          </div>
        ))}
        <Button
          type="dashed"
          size="small"
          icon={<PlusCircleOutlined />}
          onClick={() => addEditOption(row._rowKey)}
        >
          添加选项
        </Button>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* 新建表单 */}
      <Card>
        <h2 className="text-base font-semibold text-[var(--text-primary)] mb-4">基本信息</h2>
        <Form
          form={form}
          layout="vertical"
          initialValues={{ enabled: true }}
          onFinish={onAddPendingType}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5">
            <Form.Item
              label="类型标识符"
              name="code"
              rules={[
                { required: true, message: "请输入类型标识符" },
                {
                  pattern: /^[a-zA-Z_]+$/,
                  message: "只能包含英文字母和下划线",
                },
              ]}
            >
              <Input placeholder="如 welfare_fee、travel_fee" />
            </Form.Item>
            <Form.Item
              label="报销类型"
              name="name"
              tooltip="业务类型名称，用于 AI 识别匹配，不可重复"
              rules={[{ required: true, message: "请输入报销类型" }]}
            >
              <Input placeholder="如 餐费报销、差旅报销" />
            </Form.Item>
            <Form.Item
              label="展示名称"
              name="label"
              tooltip="前端展示用名称，可与其他类型重复"
              rules={[{ required: true, message: "请输入展示名称" }]}
            >
              <Input placeholder="如 福利费、差旅费" />
            </Form.Item>
            <Form.Item label="备注" name="remark">
              <TextArea rows={2} placeholder="选填" />
            </Form.Item>
            <Form.Item
              label="计算公式"
              name="formula"
              tooltip="用于计算总价，变量名对应字段标识符中参与计算的字段，如 unitPrice * quantity"
            >
              <Input placeholder="如 unitPrice * quantity" />
            </Form.Item>
            <Form.Item
              label="上限金额"
              name="over_limit_threshold"
              tooltip="报销金额超过此上限时将进行提示"
            >
              <InputNumber
                className="w-full"
                min={0}
                precision={2}
                placeholder="请输入上限金额"
                addonAfter="元"
              />
            </Form.Item>
            <Form.Item label="状态" name="enabled" valuePropName="checked">
              <Switch checkedChildren="启用" unCheckedChildren="禁用" />
            </Form.Item>
          </div>

          {/* 字段配置 */}
          <div className="mt-2 mb-6">
            <p className="text-base font-semibold text-[var(--text-primary)] mb-3">
              字段配置
            </p>
            <div className="overflow-x-auto">
              <Table
                dataSource={fields}
                rowKey="_rowKey"
                columns={fieldColumns}
                pagination={false}
                size="small"
                expandable={{
                  expandedRowRender,
                  rowExpandable: (row) => row.type === "select",
                  showExpandColumn: true,
                }}
                locale={{ emptyText: "暂无字段，点击下方按钮添加" }}
              />
            </div>
            <Button
              type="dashed"
              icon={<PlusOutlined />}
              className="w-full mt-3"
              onClick={() => setFields((p) => [...p, newFieldRow()])}
            >
              添加字段
            </Button>
          </div>

          {/* 导出字段配置 */}
          <div className="mt-2 mb-6">
            <p className="text-base font-semibold text-[var(--text-primary)] mb-1">
              导出字段配置
            </p>
            <p className="text-xs text-[var(--text-tertiary)] mb-3">
              配置导出 Excel 时包含的列，可指定参与计算的字段
            </p>
            <ExportFieldTable
              exportFields={exportFields}
              setExportFields={setExportFields}
              numberFields={[
                ...fields
                  .filter((f) => f.type === "number")
                  .map((f) => ({ key: f.key, label: f.label })),
                ...exportFields
                  .filter(
                    (f) =>
                      f.formula &&
                      (f as ExportFieldRow & { calc_fields?: string[] })
                        .calc_fields?.length,
                  )
                  .map((f) => ({ key: f.key, label: f.label })),
              ]}
            />
          </div>

          <div className="flex gap-3 justify-end mt-2">
            <Button onClick={() => navigate(-1)}>取消</Button>
            <Button htmlType="submit">
              添加到待提交列表
            </Button>
          </div>
        </Form>

        <div className="mt-5 border-t pt-4">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
            新增报销类型组件（{pendingCreateTypes.length}）
          </h3>
          {pendingCreateTypes.length === 0 ? (
            <p className="text-xs text-[var(--text-tertiary)] mb-3">
              你可以连续添加多个报销类型，这里会同时渲染多个新增组件，最后统一点击”保存全部”。
            </p>
          ) : (
            <div className="space-y-2 mb-3">
              {pendingCreateTypes.map((item, idx) => (
                <div
                  key={item.tempId}
                  className="rounded-lg border border-[var(--border-color)] px-3 py-3"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium text-[var(--text-primary)]">
                      新增类型组件 {idx + 1}
                    </div>
                    <Button
                      type="text"
                      danger
                      size="small"
                      icon={<DeleteOutlined />}
                      onClick={() =>
                        setPendingCreateTypes((prev) =>
                          prev.filter((x) => x.tempId !== item.tempId),
                        )
                      }
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Input
                      value={item.payload.code}
                      placeholder="类型标识符"
                      onChange={(e) =>
                        updatePendingType(item.tempId, { code: e.target.value })
                      }
                    />
                    <Input
                      value={item.payload.name}
                      placeholder="报销类型"
                      onChange={(e) =>
                        updatePendingType(item.tempId, { name: e.target.value })
                      }
                    />
                    <Input
                      value={item.payload.label}
                      placeholder="展示名称"
                      onChange={(e) =>
                        updatePendingType(item.tempId, { label: e.target.value })
                      }
                    />
                    <Input
                      value={item.payload.formula ?? ""}
                      placeholder="计算公式（选填）"
                      onChange={(e) =>
                        updatePendingType(item.tempId, {
                          formula: e.target.value || undefined,
                        })
                      }
                    />
                    <InputNumber
                      className="w-full"
                      min={0}
                      placeholder="上限金额（选填）"
                      value={item.payload.over_limit_threshold}
                      onChange={(v) =>
                        updatePendingType(item.tempId, {
                          over_limit_threshold: v ?? undefined,
                        })
                      }
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="text-xs text-[var(--text-secondary)]">
                      字段 {item.payload.fields.length} 个，导出字段{" "}
                      {item.payload.export_fields.length} 个
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="small"
                        onClick={() => openPendingFieldsEditor(item.tempId)}
                      >
                        编辑字段与导出字段
                      </Button>
                      <Switch
                        checked={item.payload.status === 1}
                        checkedChildren="启用"
                        unCheckedChildren="禁用"
                        onChange={(v) =>
                          updatePendingType(item.tempId, { status: v ? 1 : 0 })
                        }
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-end">
            <Button type="primary" loading={submitting} onClick={onBatchCreate}>
              保存全部
            </Button>
          </div>
        </div>
      </Card>

      <Modal
        title="编辑新增组件的字段与导出字段"
        open={!!pendingEditTypeId}
        onCancel={() => {
          setPendingEditTypeId(null);
          setPendingEditFields([]);
          setPendingEditExportFields([]);
        }}
        footer={null}
        width={920}
      >
        <div className="mb-6">
          <p className="text-sm font-medium text-[var(--text-primary)] mb-3">字段配置</p>
          <Table
            dataSource={pendingEditFields}
            rowKey="_rowKey"
            columns={pendingEditFieldColumns}
            pagination={false}
            size="small"
            expandable={{
              expandedRowRender: pendingEditExpandedRowRender,
              rowExpandable: (row) => row.type === "select",
              showExpandColumn: true,
            }}
            locale={{ emptyText: "暂无字段，点击下方按钮添加" }}
          />
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            className="w-full mt-3"
            onClick={() => setPendingEditFields((p) => [...p, newFieldRow()])}
          >
            添加字段
          </Button>
        </div>

        <div className="mb-6">
          <p className="text-sm font-medium text-[var(--text-primary)] mb-1">导出字段配置</p>
          <p className="text-xs text-[var(--text-tertiary)] mb-3">
            配置导出 Excel 时包含的列，可指定参与计算的字段
          </p>
          <ExportFieldTable
            exportFields={pendingEditExportFields}
            setExportFields={setPendingEditExportFields}
            numberFields={[
              ...pendingEditFields
                .filter((f) => f.type === "number")
                .map((f) => ({ key: f.key, label: f.label })),
              ...pendingEditExportFields
                .filter(
                  (f) =>
                    f.formula &&
                    (f as ExportFieldRow & { calc_fields?: string[] }).calc_fields
                      ?.length,
                )
                .map((f) => ({ key: f.key, label: f.label })),
            ]}
          />
        </div>

        <div className="flex justify-end gap-3">
          <Button
            onClick={() => {
              setPendingEditTypeId(null);
              setPendingEditFields([]);
              setPendingEditExportFields([]);
            }}
          >
            取消
          </Button>
          <Button type="primary" onClick={savePendingFieldsEditor}>
            保存字段配置
          </Button>
        </div>
      </Modal>

      {/* 已有类型列表 */}
      <Card>
        <h2 className="text-base font-semibold text-[var(--text-primary)] mb-4">
          已有报销类型
        </h2>
        <Table
          dataSource={typeList}
          rowKey="_id"
          loading={typeLoading}
          pagination={false}
          size="middle"
          columns={[
            { title: "标识符", dataIndex: "code" },
            { title: "报销类型", dataIndex: "name" },
            { title: "展示名称", dataIndex: "label" },
            {
              title: "字段数",
              dataIndex: "fields",
              render: (v: unknown[]) => v?.length ?? 0,
            },
            {
              title: "导出字段数",
              render: (_: unknown, record: ReimbursementType) => {
                const ef = (record as unknown as { export_fields?: unknown[] })
                  .export_fields;
                return ef?.length ?? 0;
              },
            },
            {
              title: "操作",
              render: (_: unknown, record: ReimbursementType) => (
                <div className="flex gap-2">
                  <Button
                    type="link"
                    size="small"
                    onClick={() => setDetailType(record)}
                  >
                    详情
                  </Button>
                  <Button
                    type="link"
                    size="small"
                    onClick={() => openEditModal(record)}
                  >
                    修改
                  </Button>
                  <Popconfirm
                    title="确认删除该报销类型？"
                    description="删除后不可恢复"
                    okText="确认删除"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                    onConfirm={() =>
                      deleteReimbursementType(record._id)
                        .then(() => {
                          message.success("删除成功");
                          fetchTypes();
                        })
                        .catch(() => {})
                    }
                  >
                    <Button
                      type="text"
                      danger
                      size="small"
                      icon={<DeleteOutlined />}
                    >
                      删除
                    </Button>
                  </Popconfirm>
                </div>
              ),
            },
          ]}
        />
      </Card>

      {/* 详情弹窗 */}
      <Modal
        title={`类型详情 · ${detailType?.name ?? ""}`}
        open={!!detailType}
        onCancel={() => setDetailType(null)}
        footer={<Button onClick={() => setDetailType(null)}>关闭</Button>}
        width={680}
      >
        {detailType && (
          <>
            <Descriptions column={2} size="small" bordered className="mb-4">
              <Descriptions.Item label="标识符">
                {detailType.code}
              </Descriptions.Item>
              <Descriptions.Item label="报销类型">
                {detailType.name}
              </Descriptions.Item>
              <Descriptions.Item label="展示名称">
                {detailType.label}
              </Descriptions.Item>
            </Descriptions>

            <p className="text-sm font-medium text-[var(--text-secondary)] mb-2">
              字段配置（{detailType.fields?.length ?? 0} 个）
            </p>
            <Table
              dataSource={detailType.fields ?? []}
              rowKey="_id"
              pagination={false}
              size="small"
              className="mb-4"
              columns={[
                { title: "标识符", dataIndex: "key" },
                { title: "名称", dataIndex: "label" },
                {
                  title: "类型",
                  dataIndex: "type",
                  render: (v: string) =>
                    ({
                      text: "文本",
                      number: "数字",
                      date: "日期",
                      select: "下拉",
                      textarea: "多行文本",
                    })[v] ?? v,
                },
                {
                  title: "必填",
                  dataIndex: "required",
                  render: (v: boolean) => (
                    <Tag color={v ? "red" : "default"}>
                      {v ? "必填" : "选填"}
                    </Tag>
                  ),
                },
                { title: "排序", dataIndex: "sort" },
                {
                  title: "选项",
                  dataIndex: "options",
                  render: (v: { label: string; value: string }[]) =>
                    v?.length
                      ? v.map((o) => <Tag key={o.value}>{o.label}</Tag>)
                      : "-",
                },
              ]}
            />

            {(() => {
              const ef = detailType.export_fields ?? [];
              return ef.length > 0 ? (
                <>
                  <p className="text-sm font-medium text-[var(--text-secondary)] mb-2">
                    导出字段配置（{ef.length} 个）
                  </p>
                  <Table
                    dataSource={ef}
                    rowKey="key"
                    pagination={false}
                    size="small"
                    columns={[
                      { title: "字段标识符", dataIndex: "key" },
                      { title: "导出列名", dataIndex: "label" },
                      { title: "排序", dataIndex: "sort" },
                      {
                        title: "参与计算",
                        dataIndex: "is_calculate",
                        render: (v: boolean) => (
                          <Tag color={v ? "blue" : "default"}>
                            {v ? "是" : "否"}
                          </Tag>
                        ),
                      },
                      {
                        title: "计算公式",
                        dataIndex: "formula",
                        render: (v: string) => v || "-",
                      },
                    ]}
                  />
                </>
              ) : (
                <p className="text-xs text-[var(--text-tertiary)] mt-2">暂无导出字段配置</p>
              );
            })()}
          </>
        )}
      </Modal>

      {/* 编辑弹窗 */}
      <Modal

        title={`修改报销类型 · ${editType?.name ?? ""}`}
        open={!!editType}
        onCancel={() => {
          setEditType(null);
          editForm.resetFields();
          setEditFields([]);
          setEditExportFields([]);
        }}
        footer={null}
        width={860}
      >
        {editType && (
          <Form form={editForm} layout="vertical" onFinish={onEditFinish}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5">
              <Form.Item
                label="类型标识符"
                name="code"
                rules={[
                  { required: true, message: "请输入类型标识符" },
                  {
                    pattern: /^[a-zA-Z_]+$/,
                    message: "只能包含英文字母和下划线",
                  },
                ]}
              >
                <Input placeholder="如 welfare_fee、travel_fee" />
              </Form.Item>
              <Form.Item
                label="报销类型"
                name="name"
                tooltip="业务类型名称，用于 AI 识别匹配，不可重复"
                rules={[{ required: true, message: "请输入报销类型" }]}
              >
                <Input placeholder="如 餐费报销、差旅报销" />
              </Form.Item>
              <Form.Item
                label="展示名称"
                name="label"
                tooltip="前端展示用名称，可与其他类型重复"
                rules={[{ required: true, message: "请输入展示名称" }]}
              >
                <Input placeholder="如 福利费、差旅费" />
              </Form.Item>
              <Form.Item
                label="计算公式"
                name="formula"
                tooltip="用于计算总价，变量名对应字段标识符中参与计算的字段，如 unitPrice * quantity"
              >
                <Input placeholder="如 unitPrice * quantity" />
              </Form.Item>
              <Form.Item label="超额标准（元）" name="over_limit_threshold">
                <InputNumber
                  placeholder="不填则不限制"
                  min={0}
                  className="w-full"
                />
              </Form.Item>
              <Form.Item label="状态" name="status" valuePropName="checked">
                <Switch checkedChildren="启用" unCheckedChildren="禁用" />
              </Form.Item>
            </div>

            {/* 字段配置（拖拽） */}
            <div className="mb-6">
              <p className="text-sm font-medium text-[var(--text-primary)] mb-3">字段配置</p>
              <div className="overflow-x-auto">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={onDragEnd}
                >
                  <SortableContext
                    items={editFields.map((item) => item._rowKey)}
                    strategy={verticalListSortingStrategy}
                  >
                    <Table
                      dataSource={editFields}
                      rowKey="_rowKey"
                      pagination={false}
                      size="small"
                      components={{ body: { row: DraggableRow } }}
                      expandable={{
                        expandedRowRender: editExpandedRowRender,
                        rowExpandable: (row) => row.type === "select",
                        showExpandColumn: true,
                      }}
                      columns={editFieldColumns}
                      locale={{ emptyText: "暂无字段，点击下方按钮添加" }}
                    />
                  </SortableContext>
                </DndContext>
              </div>
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                className="w-full mt-3"
                onClick={() => setEditFields((p) => [...p, newFieldRow()])}
              >
                添加字段
              </Button>
            </div>

            {/* 导出字段配置 */}
            <div className="mb-6">
              <p className="text-sm font-medium text-gray-700 mb-1">
                导出字段配置
              </p>
              <p className="text-xs text-gray-400 mb-3">
                配置导出 Excel 时包含的列，可指定参与计算的字段
              </p>
              <ExportFieldTable
                exportFields={editExportFields}
                setExportFields={setEditExportFields}
                numberFields={[
                  ...editFields
                    .filter((f) => f.type === "number")
                    .map((f) => ({ key: f.key, label: f.label })),
                  ...editExportFields
                    .filter(
                      (f) =>
                        f.formula &&
                        (f as ExportFieldRow & { calc_fields?: string[] })
                          .calc_fields?.length,
                    )
                    .map((f) => ({ key: f.key, label: f.label })),
                ]}
              />
            </div>

            <div className="flex gap-3 justify-end">
              <Button
                onClick={() => {
                  setEditType(null);
                  editForm.resetFields();
                  setEditFields([]);
                  setEditExportFields([]);
                }}
              >
                取消
              </Button>
              <Button type="primary" htmlType="submit" loading={editSubmitting}>
                保存
              </Button>
            </div>
          </Form>
        )}
      </Modal>
    </div>
  );
}

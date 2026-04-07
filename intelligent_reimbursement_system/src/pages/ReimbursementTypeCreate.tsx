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

  // 读取 AI 生成的草稿并填入表单
  const { reimbursementTypeDraft, clearReimbursementTypeDraft } = useAIStore();
  useEffect(() => {
    if (!reimbursementTypeDraft) return;
    form.setFieldsValue({
      code: reimbursementTypeDraft.code,
      label: reimbursementTypeDraft.label,
      formula: reimbursementTypeDraft.formula ?? "",
      over_limit_threshold: reimbursementTypeDraft.over_limit_threshold,
      enabled: true,
    });
    setFields(
      (reimbursementTypeDraft.fields ?? []).map((f) => ({
        ...f,
        options: f.options ?? [],
        _rowKey: Date.now().toString() + Math.random(),
      })),
    );
    setExportFields(
      (reimbursementTypeDraft.export_fields ?? []).map((f) => ({
        ...f,
        _rowKey: Date.now().toString() + Math.random(),
      })),
    );
    message.success("AI 已为您填入报销类型配置，请确认后保存");
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

  const onFinish = async (values: {
    code: string;
    label: string;
    remark?: string;
    formula?: string;
    enabled: boolean;
  }) => {
    if (typeList.find((t) => t.code === values.code)) {
      message.warning(`类型标识符「${values.code}」已存在`);
      return;
    }
    if (typeList.find((t) => t.label === values.label)) {
      message.warning(`类型名称「${values.label}」已存在`);
      return;
    }
    if (!validateFields(fields)) return;
    if (!validateExportFields(exportFields)) return;

    setSubmitting(true);
    try {
      await createReimbursementType({
        code: values.code,
        label: values.label,
        remark: values.remark,
        formula: values.formula || undefined,
        status: values.enabled ? 1 : 0,
        fields: fields.map(({ _rowKey, ...rest }) => rest),
        export_fields: exportFields.map(({ _rowKey, ...rest }) => rest),
      });
      message.success("报销类型创建成功");
      form.resetFields();
      setFields([]);
      setExportFields([]);
      fetchTypes();
    } catch {
      // 拦截器统一提示
    } finally {
      setSubmitting(false);
    }
  };

  const onEditFinish = async (values: {
    code: string;
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
      <div className="py-2 px-4 bg-gray-50 rounded-lg">
        <p className="text-xs text-gray-500 mb-2">选项配置</p>
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
      <div className="py-2 px-4 bg-gray-50 rounded-lg">
        <p className="text-xs text-gray-500 mb-2">选项配置</p>
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
      <Card className="rounded-2xl shadow-sm">
        <h2 className="text-base font-semibold text-gray-800 mb-4">基本信息</h2>
        <Form
          form={form}
          layout="vertical"
          initialValues={{ enabled: true }}
          onFinish={onFinish}
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
              <Input placeholder="如 purchase、travel" />
            </Form.Item>
            <Form.Item
              label="类型名称"
              name="label"
              rules={[{ required: true, message: "请输入类型名称" }]}
            >
              <Input placeholder="如 采购报销、差旅报销" />
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
            <Form.Item label="状态" name="enabled" valuePropName="checked">
              <Switch checkedChildren="启用" unCheckedChildren="禁用" />
            </Form.Item>
          </div>

          {/* 字段配置 */}
          <div className="mt-2 mb-6">
            <p className="text-base font-semibold text-gray-800 mb-3">
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
            <p className="text-base font-semibold text-gray-800 mb-1">
              导出字段配置
            </p>
            <p className="text-xs text-gray-400 mb-3">
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
            <Button type="primary" htmlType="submit" loading={submitting}>
              保存
            </Button>
          </div>
        </Form>
      </Card>

      {/* 已有类型列表 */}
      <Card className="rounded-2xl shadow-sm">
        <h2 className="text-base font-semibold text-gray-800 mb-4">
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
            { title: "名称", dataIndex: "label" },
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
        title={`类型详情 · ${detailType?.label ?? ""}`}
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
              <Descriptions.Item label="名称">
                {detailType.label}
              </Descriptions.Item>
            </Descriptions>

            <p className="text-sm font-medium text-gray-600 mb-2">
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
                  <p className="text-sm font-medium text-gray-600 mb-2">
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
                <p className="text-xs text-gray-400 mt-2">暂无导出字段配置</p>
              );
            })()}
          </>
        )}
      </Modal>

      {/* 编辑弹窗 */}
      <Modal
        title={`修改报销类型 · ${editType?.label ?? ""}`}
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
                <Input placeholder="如 purchase、travel" />
              </Form.Item>
              <Form.Item
                label="类型名称"
                name="label"
                rules={[{ required: true, message: "请输入类型名称" }]}
              >
                <Input placeholder="如 采购报销、差旅报销" />
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
              <p className="text-sm font-medium text-gray-700 mb-3">字段配置</p>
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

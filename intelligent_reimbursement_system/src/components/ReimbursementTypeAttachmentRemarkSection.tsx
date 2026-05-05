import { useRef } from "react";
import { Button, Form, Image, Input, Select } from "antd";
import { CloseCircleFilled, EyeOutlined, InboxOutlined } from "@ant-design/icons";
import type { UploadFile } from "antd";
import type { ReactNode } from "react";
import type { ReimbursementType } from "../api/reimbursement";

interface Props {
  itemIndex: number;
  formItemName: number;
  types: ReimbursementType[];
  categoryLoading: boolean;
  selectedType: ReimbursementType | null;
  files: UploadFile[];
  onCategoryChange: (id: string) => void;
  onFilesAdd: (files: FileList | File[]) => void;
  onFileRemove: (uid: string) => void;
  onPreview: (url: string, mime?: string) => void;
  onRemoveItem?: () => void;
  children?: ReactNode;
}

function LocalFileRow({
  file,
  onPreview,
  onRemove,
}: {
  file: UploadFile;
  onPreview: (url: string, mime?: string) => void;
  onRemove: () => void;
}) {
  const localUrl = file.originFileObj ? URL.createObjectURL(file.originFileObj) : null;
  const isImg = file.type?.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name);
  return (
    <div className="flex items-center gap-2 py-1.5 px-2 border border-gray-200 rounded-lg bg-white">
      {isImg && localUrl ? (
        <Image
          src={localUrl}
          width={40}
          height={40}
          className="rounded object-cover shrink-0"
          preview={false}
        />
      ) : (
        <div className="w-10 h-10 flex items-center justify-center bg-red-50 rounded shrink-0 text-red-400 text-xs font-bold">
          PDF
        </div>
      )}
      <span className="text-xs text-gray-600 flex-1 truncate">{file.name}</span>
      <Button
        type="text"
        size="small"
        icon={<EyeOutlined />}
        onClick={() => {
          if (localUrl) onPreview(localUrl, file.type ?? file.originFileObj?.type);
        }}
      />
      <Button type="text" size="small" danger onClick={onRemove}>
        删除
      </Button>
    </div>
  );
}

export default function ReimbursementTypeAttachmentRemarkSection({
  itemIndex,
  formItemName,
  types,
  categoryLoading,
  selectedType,
  files,
  onCategoryChange,
  onFilesAdd,
  onFileRemove,
  onPreview,
  onRemoveItem,
  children,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const overLimit = selectedType?.over_limit_threshold ?? null;

  return (
    <section className="relative rounded-xl border border-gray-200 p-4 mb-4">
      {onRemoveItem && (
        <Button
          type="text"
          danger
          size="small"
          aria-label={`删除报销项${itemIndex + 1}`}
          icon={<CloseCircleFilled />}
          className="absolute! top-2 right-2 flex items-center justify-center"
          onClick={onRemoveItem}
        />
      )}
      <p className="text-sm font-semibold text-gray-700 mb-3">报销项 {itemIndex + 1}</p>

      <Form.Item
        label="报销类型"
        name={[formItemName, "categoryId"]}
        rules={[{ required: true, message: "请选择报销类型" }]}
      >
        <Select
          showSearch
          optionFilterProp="label"
          loading={categoryLoading}
          placeholder="请选择报销类型"
          options={types.map((t) => ({ value: t._id, label: t.label }))}
          onChange={(id: string) => onCategoryChange(id)}
        />
      </Form.Item>

      {overLimit != null && (
        <div className="-mt-1 mb-3">
          <span className="text-xs text-orange-500">
            报销上限金额为 {overLimit} 元，超出属于超额报销
          </span>
        </div>
      )}

      {children}

      <div className="mb-4">
        <p className="text-sm font-medium text-gray-700 mb-2">附件（必填）</p>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*,.pdf"
          multiple
          onChange={(e) => {
            if (e.target.files?.length) onFilesAdd(e.target.files);
            e.target.value = "";
          }}
        />
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
          }}
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-3 py-6 cursor-pointer transition-colors select-none min-h-[100px] border-gray-300 bg-gray-50/50 hover:border-blue-400 hover:bg-blue-50/40"
        >
          <InboxOutlined className="text-2xl text-blue-500 mb-1" />
          <p className="text-xs text-gray-600 text-center">点击上传凭证（图片、PDF，可多选）</p>
        </div>
        {files.length > 0 && (
          <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1 mt-2">
            {files.map((file) => (
              <LocalFileRow
                key={file.uid}
                file={file}
                onPreview={onPreview}
                onRemove={() => onFileRemove(file.uid)}
              />
            ))}
          </div>
        )}
      </div>

      <Form.Item label="备注" name={[formItemName, "remark"]}>
        <Input.TextArea rows={3} placeholder="其他补充说明（选填）" />
      </Form.Item>
    </section>
  );
}

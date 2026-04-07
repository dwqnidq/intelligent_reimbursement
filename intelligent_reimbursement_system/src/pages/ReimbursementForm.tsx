import { useState, useEffect } from "react";
import {
  Form,
  Input,
  InputNumber,
  Select,
  DatePicker,
  Button,
  Upload,
  Card,
  message,
  Image,
} from "antd";
import { UploadOutlined, EyeOutlined } from "@ant-design/icons";
import type { UploadFile } from "antd";
import {
  getReimbursementTypes,
  createReimbursement,
} from "../api/reimbursement";
import type { ReimbursementType, TypeField } from "../api/reimbursement";
import { useAuthStore } from "../store/useAuthStore";
import { uploadFile } from "../api/file";
import FilePreviewModal from "../components/FilePreviewModal";
import { chatStreamFetch, fileToBase64Entry } from "../api/ai";

const { TextArea } = Input;

function DynamicField({ field }: { field: TypeField }) {
  const rules = field.required
    ? [{ required: true, message: `请填写${field.label}` }]
    : [];
  const fullRow = field.type === "textarea";

  const control = (() => {
    switch (field.type) {
      case "number":
        return (
          <InputNumber
            className="w-full"
            min={0}
            precision={2}
            placeholder={`请输入${field.label}`}
          />
        );
      case "select":
        return (
          <Select
            className="w-full"
            placeholder={`请选择${field.label}`}
            options={field.options}
          />
        );
      case "date":
        return (
          <DatePicker className="w-full" placeholder={`请选择${field.label}`} />
        );
      case "textarea":
        return <TextArea rows={3} placeholder={`请输入${field.label}`} />;
      default:
        return (
          <Input className="w-full" placeholder={`请输入${field.label}`} />
        );
    }
  })();

  return (
    <div className={fullRow ? "md:col-span-2" : ""}>
      <Form.Item label={field.label} name={["fields", field.key]} rules={rules}>
        {control}
      </Form.Item>
    </div>
  );
}

export default function ReimbursementForm() {
  const [form] = Form.useForm();
  const [types, setTypes] = useState<ReimbursementType[]>([]);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [selectedType, setSelectedType] = useState<ReimbursementType | null>(
    null,
  );
  const [selectedFields, setSelectedFields] = useState<TypeField[]>([]);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewMime, setPreviewMime] = useState<string | undefined>(undefined);

  const openPreview = (url: string, mime?: string) => {
    setPreviewUrl(url);
    setPreviewMime(mime);
  };
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    setCategoryLoading(true);
    getReimbursementTypes()
      .then((data) => setTypes(data))
      .catch(() => {})
      .finally(() => setCategoryLoading(false));
    // 自动填充申请人姓名
    if (user?.real_name) {
      form.setFieldValue("applicant", user.real_name);
    }
  }, []);

  const handleCategoryChange = (value: string) => {
    const matched = types.find((t) => t.code === value) ?? null;
    setSelectedType(matched);
    const fields = matched?.fields ?? [];
    setSelectedFields([...fields].sort((a, b) => a.sort - b.sort));
    form.setFieldValue("fields", {});
  };

  const onFinish = async (values: {
    applicant: string;
    category: string;
    fields?: Record<string, unknown>;
    remark?: string;
  }) => {
    setSubmitting(true);
    try {
      // Step 1: 有附件时先用 AI 验证是否都是真发票
      if (fileList.length > 0) {
        message.loading({
          content: "正在识别发票...",
          key: "ai_check",
          duration: 0,
        });
        const originFiles = fileList
          .map((f) => f.originFileObj)
          .filter(Boolean) as File[];
        const fileEntries = await Promise.all(
          originFiles.map(fileToBase64Entry),
        );

        let invoiceResult: boolean[] = [];
        try {
          const stream = chatStreamFetch({
            message: "帮我识别一下是否是发票",
            files: fileEntries,
          });
          for await (const chunk of stream) {
            if (
              chunk.done &&
              chunk.type === "invoice_recognition" &&
              Array.isArray(chunk.data)
            ) {
              invoiceResult = chunk.data as boolean[];
            }
          }
        } catch {
          message.destroy("ai_check");
          message.error("发票识别服务异常，请稍后再试");
          setSubmitting(false);
          return;
        }

        message.destroy("ai_check");

        const invalidNames = invoiceResult
          .map((ok, i) => (!ok ? originFiles[i]?.name : null))
          .filter(Boolean) as string[];
        if (invalidNames.length > 0) {
          message.error(
            `您提交的发票文件有误，请检查：${invalidNames.join("、")}`,
          );
          setSubmitting(false);
          return;
        }
      }

      // Step 2: 上传附件
      const uploadedIds: string[] = [];
      if (fileList.length > 0) {
        message.loading({
          content: "正在上传附件...",
          key: "uploading",
          duration: 0,
        });
        for (const file of fileList) {
          if (file.originFileObj) {
            try {
              const res = await uploadFile(file.originFileObj, "attachment");
              uploadedIds.push(res.id);
            } catch {
              message.destroy("uploading");
              message.error(`文件 ${file.name} 上传失败`);
              setSubmitting(false);
              return;
            }
          }
        }
        message.destroy("uploading");
        message.success("附件上传成功");
      }

      // Step 3: 提交报销申请
      await createReimbursement({
        applicant_name: values.applicant,
        category: selectedType?._id ?? values.category,
        detail: values.fields ?? {},
        attachments: uploadedIds,
        apply_date: new Date().toISOString().slice(0, 10),
      });
      message.success("报销单提交成功");
      form.resetFields();
      setSelectedType(null);
      setSelectedFields([]);
      setFileList([]);
    } catch {
      // 错误已由拦截器统一提示
    } finally {
      setSubmitting(false);
    }
  };

  const categoryOptions = types.map((t) => ({ label: t.label, value: t.code }));

  return (
    <Card className="rounded-2xl shadow-sm w-full flex flex-col flex-1">
      <h2 className="text-base md:text-lg font-semibold text-gray-800 mb-5 text-center">
        填写报销申请单
      </h2>

      <Form form={form} layout="vertical" onFinish={onFinish} size="middle">
        {/* 固定字段 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5">
          <Form.Item
            label="申请人"
            name="applicant"
            rules={[{ required: true, message: "请输入申请人姓名" }]}
          >
            <Input placeholder="请输入姓名" />
          </Form.Item>

          <Form.Item
            label="报销日期"
            name="date"
            rules={[{ required: true, message: "请选择日期" }]}
          >
            <DatePicker
              className="w-full"
              placeholder="请选择日期"
              disabledDate={(d) => d.isAfter(new Date(), "day")}
            />
          </Form.Item>

          <Form.Item
            label="费用类型"
            name="category"
            rules={[{ required: true, message: "请选择费用类型" }]}
          >
            <Select
              placeholder="请选择费用类型"
              options={categoryOptions}
              loading={categoryLoading}
              onChange={handleCategoryChange}
            />
          </Form.Item>
          {selectedType?.over_limit_threshold != null && (
            <div className="md:col-span-2 -mt-2 mb-1">
              <span className="text-xs text-orange-500">
                报销上限金额为 {selectedType.over_limit_threshold}{" "}
                元，超出属于超额报销
              </span>
            </div>
          )}
        </div>

        {/* 动态字段：根据所选费用类型的 fields 渲染 */}
        {selectedFields.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5">
            {selectedFields.map((field) => (
              <DynamicField key={field._id} field={field} />
            ))}
          </div>
        )}

        {/* 备注 */}
        <Form.Item label="备注" name="remark">
          <TextArea rows={3} placeholder="其他补充说明（选填）" />
        </Form.Item>

        {/* 附件 */}
        <Form.Item label="附件（发票/凭证）" name="attachments">
          <Upload
            fileList={fileList}
            onChange={({ fileList: fl }) => setFileList(fl)}
            beforeUpload={() => false}
            accept="image/*,.pdf"
            multiple
            listType="picture"
            onPreview={(file) => {
              const url =
                file.url ??
                (file.originFileObj
                  ? URL.createObjectURL(file.originFileObj)
                  : null);
              if (url) openPreview(url, file.type ?? file.originFileObj?.type);
            }}
            showUploadList={{
              showPreviewIcon: true,
              showRemoveIcon: true,
            }}
            itemRender={(originNode, file) => {
              const isImg =
                file.type?.startsWith("image/") ||
                /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name);
              const localUrl = file.originFileObj
                ? URL.createObjectURL(file.originFileObj)
                : null;
              return (
                <div className="flex items-center gap-2 py-1 px-2 border border-gray-200 rounded-lg mt-2 bg-gray-50">
                  {isImg && localUrl ? (
                    <Image
                      src={localUrl}
                      width={40}
                      height={40}
                      className="rounded object-cover flex-shrink-0"
                      preview={false}
                    />
                  ) : (
                    <div className="w-10 h-10 flex items-center justify-center bg-red-50 rounded flex-shrink-0 text-red-400 text-xs font-bold">
                      PDF
                    </div>
                  )}
                  <span className="text-xs text-gray-600 flex-1 truncate">
                    {file.name}
                  </span>
                  <Button
                    type="text"
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => {
                      if (localUrl)
                        openPreview(
                          localUrl,
                          file.type ?? file.originFileObj?.type,
                        );
                    }}
                  />
                  <Button
                    type="text"
                    size="small"
                    danger
                    onClick={() =>
                      setFileList((prev) =>
                        prev.filter((f) => f.uid !== file.uid),
                      )
                    }
                  >
                    删除
                  </Button>
                </div>
              );
            }}
          >
            <Button icon={<UploadOutlined />}>点击上传（可多选）</Button>
          </Upload>
        </Form.Item>

        <FilePreviewModal
          url={previewUrl}
          mimeType={previewMime}
          onClose={() => {
            setPreviewUrl(null);
            setPreviewMime(undefined);
          }}
        />

        <Form.Item className="mt-2 mb-0">
          <Button
            type="primary"
            htmlType="submit"
            size="large"
            className="w-full"
            loading={submitting}
          >
            提交报销申请
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
}

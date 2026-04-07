import { useEffect, useState } from "react";
import {
  Card,
  Form,
  Input,
  Button,
  List,
  Tag,
  message,
  Typography,
  Divider,
} from "antd";
import { MessageOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { createOpinion, getOpinions, type OpinionItem } from "../api/opinion";

const { TextArea } = Input;
const { Text } = Typography;

const statusMap: Record<number, { label: string; color: string }> = {
  0: { label: "待处理", color: "orange" },
  1: { label: "已处理", color: "green" },
  2: { label: "已关闭", color: "default" },
};

export default function OpinionPage() {
  const [form] = Form.useForm();
  const [opinions, setOpinions] = useState<OpinionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchOpinions = async () => {
    setLoading(true);
    try {
      const res = await getOpinions();
      setOpinions(res.data ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOpinions();
  }, []);

  const handleSubmit = async (values: { title: string; content: string }) => {
    setSubmitting(true);
    try {
      await createOpinion(values);
      message.success("意见提交成功，感谢您的反馈！");
      form.resetFields();
      fetchOpinions();
    } catch {
      message.error("提交失败，请稍后再试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* 提交表单 */}
      <Card
        title={
          <span className="flex items-center gap-2">
            <MessageOutlined className="text-blue-500" />
            提交意见反馈
          </span>
        }
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="title"
            label="标题"
            rules={[{ required: true, message: "请输入标题" }]}
          >
            <Input placeholder="请简要描述您的意见" maxLength={100} showCount />
          </Form.Item>
          <Form.Item
            name="content"
            label="详细内容"
            rules={[{ required: true, message: "请输入详细内容" }]}
          >
            <TextArea
              rows={4}
              placeholder="请详细描述您的意见或建议..."
              maxLength={2000}
              showCount
            />
          </Form.Item>
          <Form.Item className="mb-0">
            <Button type="primary" htmlType="submit" loading={submitting}>
              提交意见
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Divider />

      {/* 意见列表 */}
      <Card title="所有意见反馈">
        <List
          loading={loading}
          dataSource={opinions}
          locale={{ emptyText: "暂无意见反馈" }}
          renderItem={(item) => (
            <List.Item>
              <div className="w-full">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-gray-800">
                    {item.title}
                  </span>
                  <Tag color={statusMap[item.status]?.color}>
                    {statusMap[item.status]?.label}
                  </Tag>
                </div>
                <p className="text-gray-600 text-sm mb-2">{item.content}</p>
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  <Text type="secondary">
                    提交人：{item.uid?.real_name ?? item.uid?.username}
                  </Text>
                  <Text type="secondary">
                    {dayjs(item.createdAt).format("YYYY-MM-DD HH:mm")}
                  </Text>
                </div>
              </div>
            </List.Item>
          )}
        />
      </Card>
    </div>
  );
}

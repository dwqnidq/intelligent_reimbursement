import { useEffect, useState } from "react";
import { Card, Form, Input, Button, List, Tag, Typography, message } from "antd";
import { MessageOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { createOpinion, getMyOpinions, type OpinionItem } from "../api/opinion";

const { TextArea } = Input;
const { Text } = Typography;

const statusMap: Record<number, { label: string; color: string }> = {
  0: { label: "待处理", color: "orange" },
  1: { label: "已处理", color: "green" },
  2: { label: "已关闭", color: "default" },
};

export default function OpinionSubmitPage() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [opinions, setOpinions] = useState<OpinionItem[]>([]);

  const fetchMine = async () => {
    setLoading(true);
    try {
      const res = await getMyOpinions();
      setOpinions(Array.isArray(res) ? res : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMine();
  }, []);

  const onSubmit = async (values: { title: string; content: string }) => {
    setSubmitting(true);
    try {
      await createOpinion(values);
      message.success("意见提交成功");
      form.resetFields();
      fetchMine();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full flex flex-col flex-1 min-h-0">
      <div className="max-w-3xl w-full mx-auto space-y-6 flex-1 min-h-0">
        <Card
          title={
            <span className="flex items-center gap-2">
              <MessageOutlined className="text-blue-500" />
              填写意见反馈
            </span>
          }
        >
          <Form form={form} layout="vertical" onFinish={onSubmit}>
            <Form.Item
              name="title"
              label="标题"
              rules={[{ required: true, message: "请输入标题" }]}
            >
              <Input placeholder="请简要描述您的意见" maxLength={100} showCount />
            </Form.Item>
            <Form.Item
              name="content"
              label="描述"
              rules={[{ required: true, message: "请输入描述" }]}
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

        <Card title="我提交的意见">
          <List
            loading={loading}
            dataSource={opinions}
            locale={{ emptyText: "你还没有提交过意见" }}
            renderItem={(item) => (
              <List.Item>
                <div className="w-full">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-gray-800">{item.title}</span>
                    <Tag color={statusMap[item.status]?.color}>
                      {statusMap[item.status]?.label}
                    </Tag>
                  </div>
                  <p className="text-gray-600 text-sm mb-2">{item.content}</p>
                  <Text type="secondary">
                    {dayjs(item.createdAt).format("YYYY-MM-DD HH:mm")}
                  </Text>
                </div>
              </List.Item>
            )}
          />
        </Card>
      </div>
    </div>
  );
}


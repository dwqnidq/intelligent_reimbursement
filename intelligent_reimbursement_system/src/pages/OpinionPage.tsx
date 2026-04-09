import { useEffect, useState } from "react";
import { Card, Button, List, Tag, Typography, Popconfirm } from "antd";
import dayjs from "dayjs";
import { getOpinions, updateOpinionStatus, type OpinionItem } from "../api/opinion";

const { Text } = Typography;

const statusMap: Record<number, { label: string; color: string }> = {
  0: { label: "待处理", color: "orange" },
  1: { label: "已处理", color: "green" },
  2: { label: "已关闭", color: "default" },
};

export default function OpinionPage() {
  const [opinions, setOpinions] = useState<OpinionItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchOpinions = async () => {
    setLoading(true);
    try {
      const res = await getOpinions();
      const list = Array.isArray(res)
        ? res
        : ((res as unknown as { data?: OpinionItem[] }).data ?? []);
      setOpinions(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOpinions();
  }, []);

  const handleUpdateStatus = async (id: string, status: number) => {
    try {
      await updateOpinionStatus(id, status);
      fetchOpinions();
    } catch {
      // 错误提示由拦截器处理
    }
  };

  return (
    <div className="w-full flex flex-col flex-1 min-h-0">
      <div className="max-w-3xl w-full mx-auto space-y-6 flex-1 min-h-0">
        <Card title="所有意见反馈">
          <List
            loading={loading}
            dataSource={opinions}
            locale={{ emptyText: "暂无意见反馈" }}
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
                  <div className="flex gap-2 mb-2">
                    <Popconfirm
                      title="确认将状态标记为已处理？"
                      okText="确认"
                      cancelText="取消"
                      onConfirm={() => handleUpdateStatus(item._id, 1)}
                    >
                      <Button size="small">标记已处理</Button>
                    </Popconfirm>
                    <Popconfirm
                      title="确认将状态标记为已关闭？"
                      okText="确认"
                      cancelText="取消"
                      onConfirm={() => handleUpdateStatus(item._id, 2)}
                    >
                      <Button size="small">关闭</Button>
                    </Popconfirm>
                    <Popconfirm
                      title="确认将状态退回待处理？"
                      okText="确认"
                      cancelText="取消"
                      onConfirm={() => handleUpdateStatus(item._id, 0)}
                    >
                      <Button size="small" type="dashed">
                        退回待处理
                      </Button>
                    </Popconfirm>
                  </div>
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
    </div>
  );
}

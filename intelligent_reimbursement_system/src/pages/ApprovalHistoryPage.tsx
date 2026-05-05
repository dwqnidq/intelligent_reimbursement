import { useEffect, useState } from "react";
import {
  Table,
  Tag,
  Card,
  Button,
  Descriptions,
  Modal,
  Avatar,
  Tooltip,
} from "antd";
import {
  ReloadOutlined,
  AuditOutlined,
  UserOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  SwapOutlined,
} from "@ant-design/icons";
import {
  getMyApprovalHistory,
  getApprovalRecordByReimbursement,
} from "../api/approvalRecord";
import type {
  ApprovalHistoryItem,
  ApprovalRecordItem,
} from "../api/approvalRecord";
import FilePreviewModal from "../components/FilePreviewModal";

const statusMap: Record<string, { color: string; label: string }> = {
  pending: { color: "processing", label: "审批中" },
  approved: { color: "success", label: "已通过" },
  rejected: { color: "error", label: "已驳回" },
};

const actionMap: Record<string, { color: string; label: string }> = {
  approve: { color: "green", label: "通过" },
  reject: { color: "red", label: "驳回" },
  transfer: { color: "blue", label: "转审" },
};

export default function ApprovalHistoryPage() {
  const [list, setList] = useState<ApprovalHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Detail modal
  const [detailItem, setDetailItem] = useState<ApprovalHistoryItem | null>(
    null
  );
  const [approvalRecord, setApprovalRecord] =
    useState<ApprovalRecordItem | null>(null);
  const [approvalLoading, setApprovalLoading] = useState(false);

  // File preview
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const fetchList = () => {
    setLoading(true);
    getMyApprovalHistory()
      .then((data) => setList(data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchList();
  }, []);

  const openDetail = (item: ApprovalHistoryItem) => {
    setDetailItem(item);
    setApprovalRecord(item.approval_record);
    setApprovalLoading(true);
    getApprovalRecordByReimbursement(item.reimbursement._id)
      .then((data) => setApprovalRecord(data))
      .catch(() => {})
      .finally(() => setApprovalLoading(false));
  };

  const columns = [
    {
      title: "费用类型",
      dataIndex: ["reimbursement", "category"],
      key: "category",
      render: (v: string) => v || "-",
    },
    {
      title: "申请人",
      dataIndex: ["reimbursement", "applicant_name"],
      key: "applicant_name",
      render: (v: string) => v || "-",
    },
    {
      title: "申请日期",
      dataIndex: ["reimbursement", "apply_date"],
      key: "apply_date",
      render: (v: string | null) => v ?? "-",
    },
    {
      title: "金额",
      key: "amount",
      render: (_: unknown, record: ApprovalHistoryItem) => (
        <span className="text-red-500 font-medium">
          ¥ {(record.reimbursement.amount ?? 0).toFixed(2)}
        </span>
      ),
    },
    {
      title: "状态",
      key: "status",
      render: (_: unknown, record: ApprovalHistoryItem) => {
        const s = statusMap[record.reimbursement.status] ?? {
          color: "default",
          label: record.reimbursement.status,
        };
        return <Tag color={s.color}>{s.label}</Tag>;
      },
    },
    {
      title: "我的操作",
      key: "my_action",
      render: (_: unknown, record: ApprovalHistoryItem) => {
        if (!record.my_action) return <span className="text-[var(--text-tertiary)]">-</span>;
        const a = actionMap[record.my_action.action] ?? {
          color: "default",
          label: record.my_action.action,
        };
        return (
          <div className="flex items-center gap-1">
            <Tag color={a.color}>{a.label}</Tag>
            {record.my_action.action === "transfer" &&
              record.my_action.transferred_to_name && (
                <span className="text-xs text-[var(--text-tertiary)]">
                  → {record.my_action.transferred_to_name}
                </span>
              )}
          </div>
        );
      },
    },
    {
      title: "操作时间",
      key: "acted_at",
      render: (_: unknown, record: ApprovalHistoryItem) => {
        if (!record.my_action?.acted_at) return "-";
        return new Date(record.my_action.acted_at).toLocaleString();
      },
    },
    {
      title: "操作",
      key: "actions",
      width: 100,
      render: (_: unknown, record: ApprovalHistoryItem) => (
        <Button type="link" size="small" onClick={() => openDetail(record)}>
          详情
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
                <AuditOutlined className="text-[var(--color-primary)] text-xs" />
              </div>
              审批记录
            </span>
          }
          extra={
            <Button
              icon={<ReloadOutlined />}
              onClick={() => fetchList()}
            >
              刷新
            </Button>
          }
        >
          <Table
            dataSource={list}
            rowKey={(r) => r.approval_record._id}
            loading={loading}
            columns={columns}
            pagination={{ pageSize: 10, showTotal: (t) => `共 ${t} 条记录` }}
            size="middle"
            locale={{ emptyText: "暂无审批记录" }}
          />
        </Card>

        {/* Detail modal */}
        <Modal
          title="审批详情"
          open={!!detailItem}
          onCancel={() => setDetailItem(null)}
          footer={<Button onClick={() => setDetailItem(null)}>关闭</Button>}
          width="min(1200px, 95vw)"
          styles={{ body: { padding: "16px 24px" } }}
        >
          {detailItem && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left: Reimbursement info */}
              <div>
                <p className="text-sm font-medium text-[var(--text-secondary)] mb-2">
                  报销信息
                </p>
                <Descriptions
                  column={1}
                  size="small"
                  bordered
                  styles={{ label: { width: 90 } }}
                >
                  <Descriptions.Item label="费用类型">
                    {detailItem.reimbursement.category}
                  </Descriptions.Item>
                  <Descriptions.Item label="申请人">
                    {detailItem.reimbursement.applicant_name || "-"}
                  </Descriptions.Item>
                  <Descriptions.Item label="申请日期">
                    {detailItem.reimbursement.apply_date ?? "-"}
                  </Descriptions.Item>
                  <Descriptions.Item label="金额">
                    <span className="text-red-500 font-medium">
                      ¥ {(detailItem.reimbursement.amount ?? 0).toFixed(2)}
                    </span>
                  </Descriptions.Item>
                  <Descriptions.Item label="状态">
                    {(() => {
                      const s = statusMap[detailItem.reimbursement.status] ?? {
                        color: "default",
                        label: detailItem.reimbursement.status,
                      };
                      return <Tag color={s.color}>{s.label}</Tag>;
                    })()}
                  </Descriptions.Item>
                </Descriptions>
              </div>

              {/* Middle: Current node info */}
              <div>
                <p className="text-sm font-medium text-[var(--text-secondary)] mb-2">
                  当前审批节点
                </p>
                {approvalRecord?.flow_snapshot?.nodes?.length ? (
                  (() => {
                    const curNode =
                      approvalRecord.flow_snapshot.nodes[
                        approvalRecord.cur_node_idx
                      ];
                    if (!curNode)
                      return (
                        <div className="text-sm text-[var(--text-tertiary)] py-4 text-center">
                          审批已完成
                        </div>
                      );
                    return (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Tag
                            color={
                              curNode.sign_type === "countersign"
                                ? "blue"
                                : "cyan"
                            }
                          >
                            {curNode.sign_type === "countersign"
                              ? "会签"
                              : "或签"}
                          </Tag>
                          <span className="text-xs text-[var(--text-tertiary)]">
                            节点 {approvalRecord.cur_node_idx + 1} /{" "}
                            {approvalRecord.flow_snapshot.nodes.length}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {curNode.approvers.map((approver, aIdx) => {
                            const hasApproved =
                              curNode.approved_by?.includes(approver.name);
                            return (
                              <Tooltip
                                key={aIdx}
                                title={`${approver.dept_name ?? ""}${
                                  approver.dept_name && approver.position
                                    ? " / "
                                    : ""
                                }${approver.position ?? ""}`}
                              >
                                <div
                                  className={`flex items-center gap-1 rounded-full pl-0.5 pr-2 py-0.5 text-xs border ${
                                    hasApproved
                                      ? "bg-green-50 border-green-200 text-green-600"
                                      : "bg-[var(--bg-page)] border-[var(--border-color)] text-[var(--text-secondary)]"
                                  }`}
                                >
                                  <Avatar
                                    size={18}
                                    src={approver.avatar}
                                    icon={<UserOutlined />}
                                  />
                                  <span className="font-medium">
                                    {approver.name}
                                  </span>
                                  {hasApproved && (
                                    <CheckCircleOutlined className="text-green-500 text-[10px]" />
                                  )}
                                </div>
                              </Tooltip>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <div className="text-sm text-[var(--text-tertiary)] py-4 text-center">
                    {approvalLoading ? "加载中..." : "暂无审批流程"}
                  </div>
                )}
              </div>

              {/* Right: Full approval timeline (read-only) */}
              <div>
                <p className="text-sm font-medium text-[var(--text-secondary)] mb-2">
                  审批流程
                </p>
                {approvalLoading ? (
                  <div className="text-center text-[var(--text-tertiary)] text-sm py-4">
                    加载审批流程中...
                  </div>
                ) : approvalRecord?.flow_snapshot?.nodes?.length ? (
                  <div className="space-y-0">
                    {approvalRecord.flow_snapshot.nodes.map((node, idx) => {
                      const isCurrent =
                        idx === approvalRecord.cur_node_idx &&
                        approvalRecord.status === "pending";
                      const isPast =
                        idx < approvalRecord.cur_node_idx ||
                        approvalRecord.status === "approved";
                      const isRejected =
                        approvalRecord.status === "rejected" &&
                        idx === approvalRecord.cur_node_idx;

                      const statusIcon = isRejected ? (
                        <CloseCircleOutlined className="text-red-500 text-lg" />
                      ) : isPast ? (
                        <CheckCircleOutlined className="text-green-500 text-lg" />
                      ) : isCurrent ? (
                        <ClockCircleOutlined className="text-blue-500 text-lg animate-pulse" />
                      ) : (
                        <ClockCircleOutlined className="text-[var(--text-tertiary)] text-lg" />
                      );

                      const actionsForNode = approvalRecord.actions.filter(
                        (a) => a.node_id === node.node_id
                      );

                      return (
                        <div key={node.node_id} className="flex gap-3">
                          {/* Timeline */}
                          <div className="flex flex-col items-center">
                            <div
                              className="flex items-center justify-center w-8 h-8 rounded-full border-2 border-current flex-shrink-0"
                              style={{
                                borderColor: isRejected
                                  ? "#ef4444"
                                  : isPast
                                  ? "#22c55e"
                                  : isCurrent
                                  ? "#3b82f6"
                                  : "var(--border-color)",
                                background: isRejected
                                  ? "#fef2f2"
                                  : isPast
                                  ? "#f0fdf4"
                                  : isCurrent
                                  ? "#eff6ff"
                                  : "transparent",
                              }}
                            >
                              {statusIcon}
                            </div>
                            {idx <
                              approvalRecord.flow_snapshot.nodes.length -
                                1 && (
                              <div
                                className="w-0.5 h-6"
                                style={{
                                  background: isRejected
                                    ? "#ef4444"
                                    : isPast
                                    ? "#22c55e"
                                    : isCurrent
                                    ? "#3b82f6"
                                    : "var(--border-color)",
                                }}
                              />
                            )}
                          </div>

                          {/* Content */}
                          <div className="flex-1 pb-4 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium text-[var(--text-primary)]">
                                节点 {idx + 1}
                              </span>
                              <Tag
                                color={
                                  node.sign_type === "countersign"
                                    ? "blue"
                                    : "cyan"
                                }
                                className="text-xs"
                              >
                                {node.sign_type === "countersign"
                                  ? "会签"
                                  : "或签"}
                              </Tag>
                              {isRejected && (
                                <Tag color="red" className="text-xs">
                                  已驳回
                                </Tag>
                              )}
                              {isCurrent && (
                                <Tag color="processing" className="text-xs">
                                  审批中
                                </Tag>
                              )}
                            </div>

                            {/* Approvers */}
                            <div className="flex flex-wrap items-start gap-3 mb-1">
                              {node.approvers.map((approver, aIdx) => {
                                const hasApproved =
                                  node.approved_by?.includes(approver.name);
                                const hasRejected = actionsForNode.some(
                                  (a) =>
                                    a.approver_name === approver.name &&
                                    a.action === "reject"
                                );
                                const hasTransferred = actionsForNode.some(
                                  (a) =>
                                    a.approver_name === approver.name &&
                                    a.action === "transfer"
                                );

                                const pillBg = hasRejected
                                  ? "bg-red-50 border-red-200 text-red-600"
                                  : hasApproved
                                  ? "bg-green-50 border-green-200 text-green-600"
                                  : hasTransferred
                                  ? "bg-gray-50 border-gray-200 text-gray-400"
                                  : "bg-[var(--bg-page)] border-[var(--border-color)] text-[var(--text-secondary)]";

                                return (
                                  <Tooltip
                                    key={aIdx}
                                    title={`${approver.dept_name ?? ""}${
                                      approver.dept_name && approver.position
                                        ? " / "
                                        : ""
                                    }${approver.position ?? ""}`}
                                  >
                                    <div
                                      className={`flex items-center gap-1 rounded-full pl-0.5 pr-2 py-0.5 text-xs border ${pillBg}`}
                                    >
                                      <Avatar
                                        size={18}
                                        src={approver.avatar}
                                        icon={<UserOutlined />}
                                      />
                                      <span className="font-medium">
                                        {approver.name}
                                      </span>
                                      {hasApproved && (
                                        <CheckCircleOutlined className="text-green-500 text-[10px]" />
                                      )}
                                      {hasRejected && (
                                        <CloseCircleOutlined className="text-red-500 text-[10px]" />
                                      )}
                                      {hasTransferred &&
                                        !hasApproved &&
                                        !hasRejected && (
                                          <SwapOutlined className="text-gray-400 text-[10px]" />
                                        )}
                                    </div>
                                  </Tooltip>
                                );
                              })}
                            </div>

                            {/* Actions log */}
                            {actionsForNode.length > 0 && (
                              <div className="space-y-0.5">
                                {actionsForNode.map((action, actIdx) => (
                                  <div
                                    key={actIdx}
                                    className="text-xs text-[var(--text-tertiary)]"
                                  >
                                    {action.approver_name}{" "}
                                    {action.action === "approve"
                                      ? "通过"
                                      : action.action === "reject"
                                      ? "驳回"
                                      : `转审至 ${action.transferred_to_name}`}
                                    {action.comment
                                      ? `: ${action.comment}`
                                      : ""}
                                    {action.acted_at
                                      ? ` (${new Date(
                                          action.acted_at
                                        ).toLocaleString()})`
                                      : ""}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-sm text-[var(--text-tertiary)] py-4 text-center">
                    暂无审批流程
                  </div>
                )}
              </div>
            </div>
          )}
        </Modal>

        {/* File preview */}
        <FilePreviewModal
          url={previewUrl}
          onClose={() => setPreviewUrl(null)}
        />
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import {
  Table,
  Tag,
  Card,
  Button,
  Descriptions,
  Modal,
  Input,
  message,
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
  LoadingOutlined,
} from "@ant-design/icons";
import {
  getMyPendingApprovals,
  approveRecord,
  rejectRecord,
  transferRecord,
  getApprovalRecordByReimbursement,
} from "../api/approvalRecord";
import type {
  PendingApprovalItem,
  ApprovalRecordItem,
} from "../api/approvalRecord";
import { getEmployees } from "../api/employee";
import type { Employee } from "../api/employee";
import FilePreviewModal from "../components/FilePreviewModal";
import { useAuthStore } from "../store/useAuthStore";

export default function PendingApprovalPage() {
  const currentUser = useAuthStore((s) => s.user);
  const [list, setList] = useState<PendingApprovalItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Detail modal
  const [detailItem, setDetailItem] = useState<PendingApprovalItem | null>(
    null
  );
  const [approvalRecord, setApprovalRecord] =
    useState<ApprovalRecordItem | null>(null);
  const [approvalLoading, setApprovalLoading] = useState(false);

  // Animation
  const [animatingApprover, setAnimatingApprover] = useState<{
    nodeId: string;
    approverName: string;
    type: "approve" | "reject";
    phase: "ring" | "icon" | "fadeout" | "done";
  } | null>(null);

  // Approve loading
  const [approvingRecordId, setApprovingRecordId] = useState<string | null>(null);

  // Reject modal
  const [rejectModal, setRejectModal] = useState(false);
  const [rejectRecordId, setRejectRecordId] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [rejectLoading, setRejectLoading] = useState(false);

  // Transfer
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferFromApprover, setTransferFromApprover] = useState<{
    recordId: string;
    nodeId: string;
    name: string;
    avatar: string;
  } | null>(null);
  const [transferEmployees, setTransferEmployees] = useState<Employee[]>([]);
  const [transferEmpLoading, setTransferEmpLoading] = useState(false);
  const [transferAnimation, setTransferAnimation] = useState<{
    nodeId: string;
    fromName: string;
    fromAvatar: string;
    toName: string;
    toAvatar: string;
  } | null>(null);

  // File preview
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const fetchList = () => {
    setLoading(true);
    getMyPendingApprovals()
      .then((data) => setList(data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchList();
  }, []);

  const openDetail = (item: PendingApprovalItem) => {
    setDetailItem(item);
    setApprovalRecord(item.approval_record);
    setApprovalLoading(true);
    getApprovalRecordByReimbursement(item.reimbursement._id)
      .then((data) => setApprovalRecord(data))
      .catch(() => {})
      .finally(() => setApprovalLoading(false));
  };

  // Direct approve (no animation delay)
  const handleApprove = async (recordId: string) => {
    setApprovingRecordId(recordId);
    try {
      await approveRecord(recordId);
      message.success("审批通过");
      if (detailItem) {
        getApprovalRecordByReimbursement(detailItem.reimbursement._id)
          .then((data) => setApprovalRecord(data))
          .catch(() => {});
      }
      fetchList();
    } catch {
      // Error already shown by interceptor
    } finally {
      setApprovingRecordId(null);
    }
  };

  // Animated reject
  const handleAnimatedReject = async (
    recordId: string,
    nodeId: string,
    approverName: string
  ) => {
    setAnimatingApprover({
      nodeId,
      approverName,
      type: "reject",
      phase: "ring",
    });
    await new Promise((r) => setTimeout(r, 1000));
    setAnimatingApprover((prev) =>
      prev ? { ...prev, phase: "icon" } : null
    );
    let success = false;
    try {
      await rejectRecord(recordId);
      success = true;
    } catch {
      // Error already shown by interceptor
    }
    await new Promise((r) => setTimeout(r, 1000));
    setAnimatingApprover((prev) =>
      prev ? { ...prev, phase: "fadeout" } : null
    );
    if (success) message.success("已驳回");
    await new Promise((r) => setTimeout(r, 500));
    setAnimatingApprover(null);
    if (detailItem) {
      getApprovalRecordByReimbursement(detailItem.reimbursement._id)
        .then((data) => setApprovalRecord(data))
        .catch(() => {});
    }
    fetchList();
  };

  // Reject with node status check
  const handleRejectWithCheck = (recordId: string, record?: ApprovalRecordItem) => {
    const ar = record ?? approvalRecord;
    if (!ar) {
      message.warning("审批记录加载中，请稍后再试");
      return;
    }
    if (ar.status !== "pending") {
      const statusText = ar.status === "approved" ? "已通过" : "已驳回";
      message.warning(`该节点已审批（${statusText}），无法重复操作`);
      return;
    }
    openRejectModal(recordId);
  };

  // Reject with reason
  const openRejectModal = (recordId: string) => {
    setRejectRecordId(recordId);
    setRejectReason("");
    setRejectModal(true);
  };

  const handleRejectConfirm = async () => {
    if (!rejectReason.trim()) {
      message.warning("请填写驳回原因");
      return;
    }
    setRejectLoading(true);
    try {
      await rejectRecord(rejectRecordId, rejectReason.trim());
      message.success("已驳回");
      setRejectModal(false);
      fetchList();
      if (detailItem) {
        getApprovalRecordByReimbursement(detailItem.reimbursement._id)
          .then((data) => setApprovalRecord(data))
          .catch(() => {});
      }
    } catch {
      // Error already shown by interceptor
    } finally {
      setRejectLoading(false);
    }
  };

  // Transfer
  const openTransferModal = async (
    recordId: string,
    nodeId: string,
    approverName: string,
    approverAvatar: string
  ) => {
    setTransferFromApprover({
      recordId,
      nodeId,
      name: approverName,
      avatar: approverAvatar,
    });
    setTransferModalOpen(true);
    setTransferEmpLoading(true);
    try {
      const res = await getEmployees({ page_size: 200 });
      setTransferEmployees(res?.list ?? []);
    } catch {
      setTransferEmployees([]);
    } finally {
      setTransferEmpLoading(false);
    }
  };

  const handleTransferSelect = async (emp: Employee) => {
    if (!transferFromApprover) return;
    // 校验目标审批人是否已在当前节点
    const curNode = approvalRecord?.flow_snapshot?.nodes?.find(
      (n) => n.node_id === transferFromApprover.nodeId
    );
    if (curNode?.approvers.some((a) => a.name === emp.name)) {
      message.warning("该审批人已在当前节点中，无法转审");
      return;
    }
    setTransferModalOpen(false);
    setTransferAnimation({
      nodeId: transferFromApprover.nodeId,
      fromName: transferFromApprover.name,
      fromAvatar: transferFromApprover.avatar,
      toName: emp.name,
      toAvatar: emp.avatar || "",
    });
    try {
      await transferRecord(transferFromApprover.recordId, emp._id);
      message.success(`已转审给 ${emp.name}`);
    } catch {
      setTransferAnimation(null);
      return;
    }
    if (detailItem) {
      const data = await getApprovalRecordByReimbursement(detailItem.reimbursement._id);
      setApprovalRecord(data);
    }
    setTransferAnimation(null);
    setTransferFromApprover(null);
    fetchList();
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
      render: (_: unknown, record: PendingApprovalItem) => (
        <span className="text-red-500 font-medium">
          ¥ {(record.reimbursement.amount ?? 0).toFixed(2)}
        </span>
      ),
    },
    {
      title: "超额",
      key: "is_over_limit",
      width: 80,
      render: (_: unknown, record: PendingApprovalItem) =>
        record.reimbursement.is_over_limit ? (
          <Tag color="orange">超额</Tag>
        ) : (
          <Tag color="default">正常</Tag>
        ),
    },
    {
      title: "审批节点",
      key: "node",
      render: (_: unknown, record: PendingApprovalItem) => {
        const ar = record.approval_record;
        const curNode = ar.flow_snapshot.nodes[ar.cur_node_idx];
        if (!curNode) return "-";
        return (
          <span>
            节点 {ar.cur_node_idx + 1} / {ar.flow_snapshot.nodes.length}
            <Tag
              color={curNode.sign_type === "countersign" ? "blue" : "cyan"}
              className="ml-1 text-xs"
            >
              {curNode.sign_type === "countersign" ? "会签" : "或签"}
            </Tag>
          </span>
        );
      },
    },
    {
      title: "操作",
      key: "actions",
      width: 200,
      render: (_: unknown, record: PendingApprovalItem) => (
        <div className="flex gap-2 flex-wrap items-center">
          <Button
            type="link"
            size="small"
            onClick={() => openDetail(record)}
          >
            详情
          </Button>
          <Button
            type="link"
            size="small"
            className="text-green-500"
            loading={approvingRecordId === record.approval_record._id}
            onClick={() => handleApprove(record.approval_record._id)}
          >
            通过
          </Button>
          <Button
            type="link"
            size="small"
            className="text-red-500"
            onClick={() => handleRejectWithCheck(record.approval_record._id, record.approval_record)}
          >
            驳回
          </Button>
        </div>
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
              待审批记录
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
            pagination={{ pageSize: 10, showTotal: (t) => `共 ${t} 条待审批` }}
            size="middle"
            locale={{ emptyText: "暂无待审批记录" }}
          />
        </Card>

        {/* Detail modal - three-column layout */}
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
                  <Descriptions.Item label="超额情况">
                    {detailItem.reimbursement.is_over_limit ? (
                      <Tag color="orange">超额</Tag>
                    ) : (
                      <Tag color="default">正常</Tag>
                    )}
                  </Descriptions.Item>
                  <Descriptions.Item label="附件">
                    {detailItem.reimbursement.attachments.length
                      ? detailItem.reimbursement.attachments.map((url, i) => (
                          <Button
                            key={i}
                            type="link"
                            size="small"
                            className="p-0 block text-left"
                            onClick={() => setPreviewUrl(url)}
                          >
                            附件{i + 1}
                          </Button>
                        ))
                      : "-"}
                  </Descriptions.Item>
                </Descriptions>
              </div>

              {/* Middle: Approver info for current node */}
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
                          无当前节点
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

              {/* Right: Full approval timeline */}
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
                                const isAnimating =
                                  animatingApprover?.nodeId ===
                                    node.node_id &&
                                  animatingApprover?.approverName ===
                                    approver.name;
                                const isCurrentNode = isCurrent;

                                const pillBg =
                                  isAnimating &&
                                  (animatingApprover?.phase === "icon" ||
                                    animatingApprover?.phase === "fadeout")
                                    ? animatingApprover.type === "approve"
                                      ? "bg-green-50 border-green-200 text-green-600"
                                      : "bg-red-50 border-red-200 text-red-600"
                                    : hasRejected
                                    ? "bg-red-50 border-red-200 text-red-600"
                                    : hasApproved
                                    ? "bg-green-50 border-green-200 text-green-600"
                                    : hasTransferred
                                    ? "bg-gray-50 border-gray-200 text-gray-400"
                                    : "bg-[var(--bg-page)] border-[var(--border-color)] text-[var(--text-secondary)]";

                                const isTransferFrom =
                                  transferAnimation?.nodeId ===
                                    node.node_id &&
                                  transferAnimation?.fromName ===
                                  approver.name;

                                return (
                                  <div
                                    key={aIdx}
                                    className="flex items-center gap-1.5 flex-wrap"
                                  >
                                    <Tooltip
                                      title={`${approver.dept_name ?? ""}${
                                        approver.dept_name &&
                                        approver.position
                                          ? " / "
                                          : ""
                                      }${approver.position ?? ""}`}
                                    >
                                      <div
                                        className={`flex items-center gap-1 rounded-full pl-0.5 pr-2 py-0.5 text-xs border transition-colors duration-300 ${pillBg}`}
                                      >
                                        <div
                                          className="relative flex-shrink-0"
                                          style={{
                                            width: 22,
                                            height: 22,
                                          }}
                                        >
                                          <Avatar
                                            size={18}
                                            src={approver.avatar}
                                            icon={<UserOutlined />}
                                            style={{
                                              position: "absolute",
                                              top: 2,
                                              left: 2,
                                            }}
                                          />
                                          {isAnimating &&
                                            animatingApprover?.phase ===
                                              "ring" && (
                                              <svg
                                                className="absolute top-0 left-0"
                                                width="22"
                                                height="22"
                                                viewBox="0 0 22 22"
                                                style={{
                                                  pointerEvents: "none",
                                                }}
                                              >
                                                <circle
                                                  cx="11"
                                                  cy="11"
                                                  r="9"
                                                  fill="none"
                                                  stroke={
                                                    animatingApprover.type ===
                                                    "approve"
                                                      ? "#22c55e"
                                                      : "#ef4444"
                                                  }
                                                  strokeWidth="2"
                                                  strokeDasharray="56.5"
                                                  strokeDashoffset="56.5"
                                                  strokeLinecap="round"
                                                  className="approval-progress-ring"
                                                />
                                              </svg>
                                            )}
                                          {isAnimating &&
                                            (animatingApprover?.phase ===
                                              "icon" ||
                                              animatingApprover?.phase ===
                                                "fadeout") && (
                                              <div
                                                className={`absolute -top-1 -right-1 z-10 ${
                                                  animatingApprover.phase ===
                                                  "fadeout"
                                                    ? "approval-icon-fadeout"
                                                    : "approval-icon-appear"
                                                }`}
                                              >
                                                {animatingApprover.type ===
                                                "approve" ? (
                                                  <CheckCircleOutlined className="text-green-500 text-xs" />
                                                ) : (
                                                  <CloseCircleOutlined className="text-red-500 text-xs" />
                                                )}
                                              </div>
                                            )}
                                        </div>
                                        <span className="font-medium">
                                          {approver.name}
                                        </span>
                                        {hasApproved && !isAnimating && (
                                          <CheckCircleOutlined className="text-green-500 text-[10px]" />
                                        )}
                                        {hasRejected && !isAnimating && (
                                          <CloseCircleOutlined className="text-red-500 text-[10px]" />
                                        )}
                                        {hasTransferred && !hasApproved && !hasRejected && !isAnimating && (
                                          <>
                                            <SwapOutlined className="text-gray-400 text-[10px]" />
                                            <span className="text-gray-400 text-[10px]">已转审</span>
                                          </>
                                        )}
                                      </div>
                                    </Tooltip>

                                    {/* Action buttons */}
                                    {isCurrentNode &&
                                      approvalRecord?.status === "pending" &&
                                      approver.name === currentUser?.real_name &&
                                      !hasApproved &&
                                      !hasRejected &&
                                      !hasTransferred &&
                                      !isAnimating && (
                                        <div className="flex items-center gap-1.5 ml-1">
                                          <Tooltip title="通过">
                                            {approvingRecordId === approvalRecord._id ? (
                                              <LoadingOutlined className="text-blue-500 text-base" />
                                            ) : (
                                              <CheckCircleOutlined
                                                className="text-green-500 text-base cursor-pointer hover:text-green-400 hover:bg-green-50 rounded-full p-1 transition-all"
                                                onClick={() => handleApprove(approvalRecord._id)}
                                              />
                                            )}
                                          </Tooltip>
                                          <Tooltip title="驳回">
                                            <CloseCircleOutlined
                                              className="text-red-500 text-base cursor-pointer hover:text-red-400 hover:bg-red-50 rounded-full p-1 transition-all"
                                              onClick={() => handleRejectWithCheck(approvalRecord._id)}
                                            />
                                          </Tooltip>
                                          <Tooltip title="转审">
                                            <SwapOutlined
                                              className="text-blue-500 text-base cursor-pointer hover:text-blue-400 hover:bg-blue-50 rounded-full p-1 transition-all"
                                              onClick={() =>
                                                openTransferModal(
                                                  approvalRecord._id,
                                                  node.node_id,
                                                  approver.name,
                                                  approver.avatar
                                                )
                                              }
                                            />
                                          </Tooltip>
                                        </div>
                                      )}

                                    {/* Transfer status message for current user */}
                                    {isCurrentNode &&
                                      approvalRecord?.status === "pending" &&
                                      approver.name === currentUser?.real_name &&
                                      hasTransferred &&
                                      !isAnimating && (
                                        <div className="ml-1 text-xs text-[var(--text-tertiary)]">
                                          您已将审批权转审给{" "}
                                          {actionsForNode.find(
                                            (a) =>
                                              a.approver_name === approver.name &&
                                              a.action === "transfer"
                                          )?.transferred_to_name ?? "其他审批人"}
                                        </div>
                                      )}

                                    {/* Transfer chain */}
                                    {isTransferFrom &&
                                      transferAnimation && (
                                        <div className="flex items-center gap-1 ml-1">
                                          <div className="flex flex-col items-center">
                                            <span className="text-[10px] text-blue-500 font-medium whitespace-nowrap">
                                              转审至
                                            </span>
                                            <svg
                                              width="50"
                                              height="12"
                                              viewBox="0 0 50 12"
                                              className="block"
                                            >
                                              <line
                                                x1="0"
                                                y1="6"
                                                x2="50"
                                                y2="6"
                                                stroke="#3b82f6"
                                                strokeWidth="1.5"
                                                strokeDasharray="4 2"
                                                className="transfer-chain-draw"
                                              />
                                              <polygon
                                                points="46,2 50,6 46,10"
                                                fill="#3b82f6"
                                                className="transfer-target-appear"
                                              />
                                            </svg>
                                          </div>
                                          <div className="flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 text-blue-600 pl-0.5 pr-2 py-0.5 text-xs transfer-target-appear">
                                            <Avatar
                                              size={18}
                                              src={
                                                transferAnimation.toAvatar
                                              }
                                              icon={<UserOutlined />}
                                            />
                                            <span className="font-medium">
                                              {transferAnimation.toName}
                                            </span>
                                          </div>
                                        </div>
                                      )}
                                  </div>
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

        {/* Reject reason modal */}
        <Modal
          title="填写驳回原因"
          open={rejectModal}
          onOk={handleRejectConfirm}
          onCancel={() => setRejectModal(false)}
          okText="确定驳回"
          cancelText="取消"
          okButtonProps={{ danger: true, loading: rejectLoading }}
        >
          <div className="mt-4">
            <Input.TextArea
              rows={3}
              placeholder="请输入驳回原因"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
        </Modal>

        {/* Transfer modal */}
        <Modal
          title="转审给"
          open={transferModalOpen}
          onCancel={() => {
            setTransferModalOpen(false);
            setTransferFromApprover(null);
          }}
          footer={null}
          width={480}
        >
          {transferFromApprover && (
            <div className="mb-3 text-sm text-[var(--text-secondary)]">
              将{" "}
              <span className="font-medium text-[var(--text-primary)]">
                {transferFromApprover.name}
              </span>{" "}
              的审批权转给:
            </div>
          )}
          {transferEmpLoading ? (
            <div className="text-center py-8">
              <LoadingOutlined className="text-2xl text-[var(--color-primary)]" />
            </div>
          ) : (
            <div style={{ maxHeight: 400, overflow: "auto" }}>
              {transferEmployees.map((emp) => (
                <div
                  key={emp._id}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-[var(--bg-page)] transition-colors"
                  onClick={() => handleTransferSelect(emp)}
                >
                  <Avatar
                    src={emp.avatar}
                    icon={<UserOutlined />}
                    size={36}
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-[var(--text-primary)]">
                      {emp.name}
                    </div>
                    <div className="text-xs text-[var(--text-tertiary)]">
                      {emp.dept_id?.name ?? ""}
                      {emp.dept_id?.name && emp.position ? " / " : ""}
                      {emp.position ?? ""}
                      {emp.employee_no ? ` (${emp.employee_no})` : ""}
                    </div>
                  </div>
                </div>
              ))}
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

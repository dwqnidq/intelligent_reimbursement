import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import { message as antdMessage, Popconfirm } from "antd";
import {
  RobotOutlined,
  CloseOutlined,
  SendOutlined,
  DeleteOutlined,
  CloudUploadOutlined,
  ScanOutlined,
  FileImageOutlined,
  FilePdfOutlined,
} from "@ant-design/icons";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import {
  chatStreamFetch,
  fileToBase64Entry,
  REIMBURSEMENT_FORM_EXTRACT_MESSAGE,
  type AiReimbursementFormExtractPayload,
} from "../api/ai";
import {
  createReimbursement,
  getReimbursementTypes,
  type ReimbursementType,
} from "../api/reimbursement";
import { uploadFile } from "../api/file";
import { getDepartmentNameOptions } from "../api/department";
import { useAIStore } from "../store/useAIStore";
import { useAuthStore } from "../store/useAuthStore";
import type {
  AIReimbursementTypeDraft,
  AIChatMessage,
  AIChatAttachment,
} from "../store/useAIStore";
import {
  ProgressCard,
  ResultCard,
  SuccessCard,
  NoRecognizableCard,
  ProfileGapCard,
} from "./ReimbursementChatCards";
import type { AiReimbursementFormExtractRow } from "../api/ai";
import {
  applyManualTypeSelection,
  buildFileSlotSummaries,
  buildRecognitionInvoiceItems,
  normalizeExtractGroups,
  resolveResultCardMode,
  type RecognitionInvoiceItem,
  type FileSlotRecognitionSummary,
  type ResultCardMode,
} from "../utils/reimbursementRecognition";
import "./AIAssistant.css";

const ACCEPTED_EXTS = ["jpg", "jpeg", "png", "gif", "webp", "pdf"];

type MessageType = AIChatMessage["type"];

type PendingFile = {
  id: string;
  file: File;
};

function newMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileToAttachment(file: File): AIChatAttachment {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  let kind: AIChatAttachment["kind"] = "other";
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) kind = "image";
  else if (ext === "pdf") kind = "pdf";
  return { name: file.name, size: file.size, kind };
}

function filterAcceptedFiles(files: File[]): File[] {
  return files.filter((f) => {
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    return ACCEPTED_EXTS.includes(ext);
  });
}

type AIChatExtractPayload = {
  kind: "extract";
  fileNames: string[];
  groups: AiReimbursementFormExtractRow[][];
  summaries: FileSlotRecognitionSummary[];
  items: RecognitionInvoiceItem[];
  mode: ResultCardMode;
  status: "recognizing" | "active" | "cancelled" | "submitted";
  submitResult?: { count: number; total: number };
};

function getExtractPayload(data: unknown): AIChatExtractPayload | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Partial<AIChatExtractPayload>;
  if (row.kind !== "extract") return null;
  return row as AIChatExtractPayload;
}

function emptyExtractPayload(fileNames: string[]): AIChatExtractPayload {
  return {
    kind: "extract",
    fileNames,
    groups: [],
    summaries: [],
    items: [],
    mode: "all_unmatched",
    status: "recognizing",
  };
}

function FileKindIcon({ kind }: { kind: AIChatAttachment["kind"] }) {
  if (kind === "pdf") {
    return <FilePdfOutlined className="file-kind-icon file-kind-icon-pdf" />;
  }
  return <FileImageOutlined className="file-kind-icon file-kind-icon-image" />;
}

function FileAttachmentBubble({
  attachments,
}: {
  attachments: AIChatAttachment[];
}) {
  return (
    <div className="file-attachment-list">
      {attachments.map((attachment, index) => (
        <div
          key={`${attachment.name}-${index}`}
          className="file-attachment-item"
        >
          <div className={`file-kind-icon-wrap file-kind-icon-wrap-${attachment.kind}`}>
            <FileKindIcon kind={attachment.kind} />
          </div>
          <div className="file-attachment-meta">
            <span className="file-attachment-name" title={attachment.name}>
              {attachment.name}
            </span>
            <span className="file-attachment-size">
              {formatFileSize(attachment.size)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function PendingFilesStrip({
  items,
  recognizing,
  onRemove,
  onRecognize,
}: {
  items: PendingFile[];
  recognizing: boolean;
  onRemove: (id: string) => void;
  onRecognize: () => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="pending-files-strip">
      <div className="pending-files-header">
        <span className="pending-files-title">
          待识别文件 · {items.length}
        </span>
        <button
          type="button"
          className="pending-recognize-btn"
          onClick={onRecognize}
          disabled={recognizing}
        >
          <ScanOutlined />
          {recognizing ? "识别中…" : "开始识别"}
        </button>
      </div>
      <div className="pending-files-list">
        {items.map((item) => {
          const kind = fileToAttachment(item.file).kind;
          return (
          <div key={item.id} className="pending-file-chip">
            <div className={`file-kind-icon-wrap file-kind-icon-wrap-${kind}`}>
              <FileKindIcon kind={kind} />
            </div>
            <div className="pending-file-info">
              <span className="pending-file-name" title={item.file.name}>
                {item.file.name}
              </span>
              <span className="pending-file-size">
                {formatFileSize(item.file.size)}
              </span>
            </div>
            <button
              type="button"
              className="pending-file-remove"
              onClick={() => onRemove(item.id)}
              disabled={recognizing}
              aria-label="移除文件"
            >
              <CloseOutlined />
            </button>
          </div>
          );
        })}
      </div>
    </div>
  );
}

function normalizeTypeDrafts(data: unknown): AIReimbursementTypeDraft[] {
  if (!data || typeof data !== "object") return [];
  let list: AIReimbursementTypeDraft[];
  if (Array.isArray(data)) {
    list = data as AIReimbursementTypeDraft[];
  } else {
    const obj = data as Record<string, unknown>;
    if (
      "code" in obj &&
      "name" in obj &&
      "label" in obj &&
      "fields" in obj &&
      "export_fields" in obj
    ) {
      return [obj as unknown as AIReimbursementTypeDraft];
    }
    list = Object.values(obj).filter(
      (v) =>
        v &&
        typeof v === "object" &&
        "code" in (v as Record<string, unknown>) &&
        "name" in (v as Record<string, unknown>) &&
        "label" in (v as Record<string, unknown>) &&
        "fields" in (v as Record<string, unknown>),
    ) as AIReimbursementTypeDraft[];
  }
  const seen = new Set<string>();
  return list.filter((item) => {
    if (seen.has(item.code)) return false;
    seen.add(item.code);
    return true;
  });
}

function ReimbursementTypeCard({
  drafts,
}: {
  drafts: AIReimbursementTypeDraft[];
}) {
  if (!drafts.length) return null;
  return (
    <div className="result-card">
      <div className="result-card-title">
        📋 共生成 {drafts.length} 个报销类型
      </div>
      {drafts.map((d, idx) => (
        <div key={`${d.code}-${idx}`} className="result-card-row">
          {idx + 1}. {d.name} · {d.label}（{d.code}） · 字段{" "}
          {(d.fields ?? []).length} 个
        </div>
      ))}
    </div>
  );
}

export default function AIAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<AIChatMessage[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [types, setTypes] = useState<ReimbursementType[]>([]);
  const [recognizing, setRecognizing] = useState(false);
  const [submittingMessageId, setSubmittingMessageId] = useState<string | null>(
    null,
  );
  const [departmentName, setDepartmentName] = useState("");
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const extractFilesRef = useRef<Map<string, File[]>>(new Map());
  const navigate = useNavigate();
  const setReimbursementTypeDraft = useAIStore(
    (s) => s.setReimbursementTypeDraft,
  );
  const getChatMessages = useAIStore((s) => s.getChatMessages);
  const setChatMessages = useAIStore((s) => s.setChatMessages);
  const clearChatMessages = useAIStore((s) => s.clearChatMessages);
  const menus = useAuthStore((s) => s.menus);
  const user = useAuthStore((s) => s.user);
  const isAdmin = useAuthStore((s) => s.hasPermission("reimbursement:approve"));

  const userId = user?._id ?? "guest";

  const profileReady = Boolean(
    user?.payment_account?.trim() &&
      user?.company_id?.trim() &&
      user?.company_name?.trim(),
  );

  const findTypeCreatePath = (): string | null => {
    const flat = (items: typeof menus): typeof menus =>
      items.flatMap((m) => [m, ...flat(m.children ?? [])]);
    const found = flat(menus).find(
      (m) =>
        m.component === "ReimbursementTypeCreate" ||
        m.path?.includes("reimbursement-type"),
    );
    return found?.path ?? null;
  };

  const findReimbursementListPath = (): string | null => {
    const flat = (items: typeof menus): typeof menus =>
      items.flatMap((m) => [m, ...flat(m.children ?? [])]);
    const found = flat(menus).find(
      (m) =>
        m.component === "ReimbursementList" ||
        m.path?.includes("reimbursement-list"),
    );
    return found?.path ?? null;
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, recognizing, pendingFiles]);

  useEffect(() => {
    setHistoryLoaded(false);
    setMessages([]);
    setPendingFiles([]);
    extractFilesRef.current.clear();
  }, [userId]);

  useEffect(() => {
    if (!isOpen || historyLoaded) return;
    setMessages(getChatMessages(userId));
    setHistoryLoaded(true);
  }, [isOpen, historyLoaded, userId, getChatMessages]);

  useEffect(() => {
    if (!historyLoaded) return;
    const persistable = messages.filter((m) => !m.streaming);
    setChatMessages(userId, persistable);
  }, [messages, userId, setChatMessages, historyLoaded]);

  useEffect(() => {
    if (!isOpen) return;
    getReimbursementTypes()
      .then((res) => setTypes(res ?? []))
      .catch(() => {});
    getDepartmentNameOptions()
      .then((names) => setDepartmentName(names[0] ?? ""))
      .catch(() => {});
  }, [isOpen]);

  const addPendingFiles = useCallback((files: File[]) => {
    if (isAdmin) {
      antdMessage.info("管理员账号请使用「填写报销单」页面上传发票，AI 助手仅支持政策咨询");
      return;
    }
    const accepted = filterAcceptedFiles(files);
    if (accepted.length === 0) {
      antdMessage.warning("请上传图片或 PDF 文件");
      return;
    }
    if (accepted.length < files.length) {
      antdMessage.warning("部分文件格式不支持，已自动过滤");
    }
    setPendingFiles((prev) => {
      const existing = new Set(prev.map((p) => `${p.file.name}-${p.file.size}`));
      const next = [...prev];
      for (const file of accepted) {
        const key = `${file.name}-${file.size}`;
        if (existing.has(key)) continue;
        existing.add(key);
        next.push({
          id: newMessageId(),
          file,
        });
      }
      return next;
    });
  }, [isAdmin]);

  const removePendingFile = useCallback((id: string) => {
    setPendingFiles((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const clearPendingFiles = useCallback(() => {
    setPendingFiles([]);
  }, []);

  const patchExtractMessage = useCallback(
    (
      messageId: string,
      updater: (prev: AIChatExtractPayload) => AIChatExtractPayload,
    ) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          const payload = getExtractPayload(m.data);
          if (!payload) return m;
          return { ...m, data: updater(payload) };
        }),
      );
    },
    [],
  );

  const runExtract = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      const userMsgId = newMessageId();
      const assistantMsgId = newMessageId();
      const attachments = files.map(fileToAttachment);
      const fileNames = files.map((f) => f.name);

      setRecognizing(true);
      extractFilesRef.current.set(assistantMsgId, files);
      setMessages((prev) => [
        ...prev,
        {
          id: userMsgId,
          role: "user",
          content: "",
          attachments,
          createdAt: Date.now(),
        },
        {
          id: assistantMsgId,
          role: "assistant",
          content: "",
          type: "reimbursement_extract",
          streaming: true,
          createdAt: Date.now(),
          data: emptyExtractPayload(fileNames),
        },
      ]);

      try {
        const loadedTypes =
          types.length > 0 ? types : ((await getReimbursementTypes()) ?? []);
        if (types.length === 0 && loadedTypes.length > 0) {
          setTypes(loadedTypes);
        }

        const fileEntries = await Promise.all(files.map(fileToBase64Entry));
        const stream = chatStreamFetch({
          message: REIMBURSEMENT_FORM_EXTRACT_MESSAGE,
          files: fileEntries,
        });
        let payload: AiReimbursementFormExtractPayload | null = null;

        for await (const chunk of stream) {
          if (chunk.done && chunk.type === "reimbursement_form_extract") {
            payload = chunk.data as AiReimbursementFormExtractPayload;
          }
        }

        if (!payload) {
          antdMessage.error("未能获取识别结果，请重试");
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    type: "error",
                    content: "抱歉，未能识别发票内容，请重试或更换文件。",
                    streaming: false,
                    data: undefined,
                  }
                : m,
            ),
          );
          extractFilesRef.current.delete(assistantMsgId);
          return;
        }

        const groups = normalizeExtractGroups(payload);
        const activeTypes = loadedTypes;
        const summaries = buildFileSlotSummaries(groups, activeTypes, fileNames);
        const items = buildRecognitionInvoiceItems(groups, summaries, activeTypes);
        const mode = resolveResultCardMode(items);

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  content: "",
                  streaming: false,
                  type: "reimbursement_extract",
                  data: {
                    kind: "extract",
                    fileNames,
                    groups,
                    summaries,
                    items,
                    mode,
                    status: "active",
                  } satisfies AIChatExtractPayload,
                }
              : m,
          ),
        );
      } catch {
        antdMessage.error("识别失败，请稍后再试");
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  type: "error",
                  content: "抱歉，识别出错了，请稍后再试。",
                  streaming: false,
                  data: undefined,
                }
              : m,
          ),
        );
        extractFilesRef.current.delete(assistantMsgId);
      } finally {
        setRecognizing(false);
      }
    },
    [types],
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    e.target.value = "";
    addPendingFiles(selected);
  };

  const handleStartRecognize = () => {
    if (pendingFiles.length === 0 || recognizing) return;
    const files = pendingFiles.map((p) => p.file);
    clearPendingFiles();
    void runExtract(files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (isLoading || recognizing || Boolean(submittingMessageId)) return;
    addPendingFiles(Array.from(e.dataTransfer.files ?? []));
  };

  const handleSelectType = (
    messageId: string,
    fileIndex: number,
    categoryId: string,
  ) => {
    patchExtractMessage(messageId, (prev) => {
      if (prev.status !== "active") return prev;
      const summaries = applyManualTypeSelection(
        prev.summaries,
        fileIndex,
        categoryId,
      );
      const items = buildRecognitionInvoiceItems(
        prev.groups,
        summaries,
        types,
      );
      return {
        ...prev,
        summaries,
        items,
        mode: resolveResultCardMode(items),
      };
    });
  };

  const handleSubmitReimbursement = async (messageId: string) => {
    const msg = messages.find((m) => m.id === messageId);
    const extract = msg ? getExtractPayload(msg.data) : null;
    const files = extractFilesRef.current.get(messageId);
    if (!extract || extract.status !== "active" || !files?.length || !profileReady) {
      return;
    }

    const submittable = extract.items.filter((i) => !i.duplicate && i.categoryId);
    if (submittable.length === 0) {
      antdMessage.warning("没有可提交的发票，请先选择报销类型或移除重复项");
      return;
    }

    setSubmittingMessageId(messageId);
    try {
      const uploadedIds: string[] = [];
      for (const file of files) {
        const res = await uploadFile(file, "attachment");
        uploadedIds.push(res.id);
      }

      const applyDate = dayjs().format("YYYY-MM-DD");
      const payload = submittable.map((item) => {
        const group = extract.groups[item.fileIndex - 1] ?? [];
        const head =
          group.find((r) => (r.fields?.length ?? 0) > 0) ?? group[0];
        const details: Record<string, unknown> = {};
        for (const field of head?.fields ?? []) {
          if (field.key) details[field.key] = field.value ?? "";
        }
        return {
          applicant_name: user?.real_name ?? "",
          category: item.categoryId!,
          department_name: departmentName,
          apply_date: applyDate,
          attachments: [uploadedIds[item.fileIndex - 1]].filter(Boolean),
          details: [details],
          ...(item.invoiceNumber ? { invoice_number: item.invoiceNumber } : {}),
          ...(item.invoiceNumber
            ? {
                invoice_info: {
                  invoice_number: item.invoiceNumber,
                  invoice_title: item.invoiceTitle,
                  invoice_date: item.invoiceDate,
                  issuer: item.issuer,
                },
              }
            : {}),
        };
      });

      const res = await createReimbursement(payload);
      const total = submittable.reduce((s, i) => s + i.amount, 0);
      patchExtractMessage(messageId, (prev) => ({
        ...prev,
        status: "submitted",
        submitResult: { count: res.count, total },
      }));
      antdMessage.success("报销提交成功");
    } catch {
      antdMessage.error("提交失败，请稍后再试");
    } finally {
      setSubmittingMessageId(null);
    }
  };

  const handleCancelExtract = (messageId: string) => {
    patchExtractMessage(messageId, (prev) =>
      prev.status === "active" ? { ...prev, status: "cancelled" } : prev,
    );
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userInput = input;
    const userMsgId = newMessageId();
    const assistantMsgId = newMessageId();
    setMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        role: "user",
        content: userInput,
        createdAt: Date.now(),
      },
    ]);
    setInput("");
    setIsLoading(true);

    setMessages((prev) => [
      ...prev,
      {
        id: assistantMsgId,
        role: "assistant",
        content: "",
        streaming: true,
        createdAt: Date.now(),
      },
    ]);

    try {
      const stream = chatStreamFetch({ message: userInput });
      let fullContent = "";

      for await (const chunk of stream) {
        if (!chunk.done && chunk.token) {
          fullContent += chunk.token;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, content: fullContent, streaming: true }
                : m,
            ),
          );
        }

        if (chunk.done) {
          const type = (chunk.type as MessageType) || "chat";
          const finalContent =
            type === "reimbursement_type"
              ? chunk.message || "报销类型已生成"
              : type === "invoice_recognition"
                ? chunk.message || "发票识别完成"
                : chunk.message || fullContent || "处理完成";

          if (type === "reimbursement_type" && chunk.data) {
            const drafts = normalizeTypeDrafts(chunk.data);
            if (drafts.length > 0) {
              setReimbursementTypeDraft(drafts);
              const path = findTypeCreatePath();
              if (path && window.location.pathname !== path) {
                navigate(path);
              }
              setIsOpen(false);
            }
          }

          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    content: finalContent,
                    streaming: false,
                    type,
                    data: chunk.data,
                  }
                : m,
            ),
          );
        }
      }
    } catch {
      antdMessage.error("处理失败，请稍后再试");
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? {
                ...m,
                content: "抱歉，处理出错了，请稍后再试",
                streaming: false,
              }
            : m,
        ),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearHistory = () => {
    clearChatMessages(userId);
    setMessages([]);
    clearPendingFiles();
    extractFilesRef.current.clear();
    antdMessage.success("聊天记录已清空");
  };

  const renderExtractCardsForMessage = (
    messageId: string,
    extract: AIChatExtractPayload,
    streaming?: boolean,
  ) => {
    const isRecognizing =
      streaming || extract.status === "recognizing" || recognizing;
    if (isRecognizing) {
      return <ProgressCard done={0} total={1} hint="正在 AI 识别发票…" />;
    }

    const frozen = extract.status !== "active";
    const canAct =
      extract.status === "active" &&
      Boolean(extractFilesRef.current.get(messageId)?.length);

    if (extract.items.length === 0) {
      return (
        <NoRecognizableCard skippedNames={extract.fileNames} />
      );
    }

    const sessionTypes = types;

    const resultCard = (
      <ResultCard
        items={extract.items}
        mode={extract.mode}
        types={sessionTypes}
        onSelectType={
          canAct
            ? (fileIndex, categoryId) =>
                handleSelectType(messageId, fileIndex, categoryId)
            : undefined
        }
        onSubmit={
          canAct && profileReady
            ? () => void handleSubmitReimbursement(messageId)
            : undefined
        }
        onCancel={
          canAct ? () => handleCancelExtract(messageId) : undefined
        }
        submitting={submittingMessageId === messageId}
      />
    );

    const blocks: ReactNode[] = [resultCard];

    if (!profileReady && extract.status === "active") {
      const missing: string[] = [];
      if (!user?.company_id?.trim()) missing.push("报销公司");
      if (!user?.payment_account?.trim()) missing.push("收款账户");
      blocks.push(
        <ProfileGapCard
          missing={missing}
          onGoProfile={() => {
            navigate("/profile");
            setIsOpen(false);
          }}
        />,
      );
    }

    if (extract.status === "submitted" && extract.submitResult) {
      blocks.push(
        <SuccessCard
          count={extract.submitResult.count}
          totalAmount={extract.submitResult.total}
          onViewList={() => {
            const path = findReimbursementListPath();
            if (path) navigate(path);
            setIsOpen(false);
          }}
        />,
      );
    }

    if (frozen && extract.status === "cancelled") {
      blocks.push(
        <div className="rc-alert warn" style={{ marginTop: 8 }}>
          已取消本次操作，识别结果仍保留在上方。
        </div>,
      );
    }

    return <>{blocks}</>;
  };

  return (
    <>
      <AnimatePresence>
        {!isOpen && (
          <motion.div
            className="ai-assistant-button"
            onClick={() => setIsOpen(true)}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <RobotOutlined style={{ color: "white", fontSize: 24 }} />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="ai-assistant-chat"
            initial={{
              scale: 0.5,
              opacity: 0,
              y: 20,
              transformOrigin: "bottom right",
            }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.5, opacity: 0, y: 20 }}
            transition={{ type: "spring", stiffness: 350, damping: 25 }}
          >
            <div className="chat-header">
              <div className="header-title">
                <RobotOutlined style={{ fontSize: 18 }} />
                <span>智能助手</span>
              </div>
              <div className="header-actions">
                {messages.length > 0 && (
                  <Popconfirm
                    title="清空聊天记录？"
                    description="此操作不可恢复"
                    onConfirm={handleClearHistory}
                    okText="清空"
                    cancelText="取消"
                  >
                    <motion.button
                      type="button"
                      className="header-icon-btn"
                      whileHover={{ scale: 1.08 }}
                      whileTap={{ scale: 0.92 }}
                      title="清空聊天记录"
                    >
                      <DeleteOutlined style={{ fontSize: 14 }} />
                    </motion.button>
                  </Popconfirm>
                )}
                <motion.button
                  className="close-btn"
                  onClick={() => setIsOpen(false)}
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <CloseOutlined style={{ fontSize: 14 }} />
                </motion.button>
              </div>
            </div>

            <div
              className={`chat-messages ${isDragOver && !isAdmin ? "chat-messages-dragover" : ""}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {isDragOver && !isAdmin && (
                <div className="chat-drop-overlay">
                  <CloudUploadOutlined />
                  <span>松开以上传发票文件</span>
                </div>
              )}
              {messages.length === 0 && !recognizing && (
                <div className="chat-welcome">
                  <div className="chat-welcome-icon">
                    <RobotOutlined />
                  </div>
                  <p className="chat-welcome-title">你好，我是智能报销助手</p>
                  <p className="chat-welcome-desc">
                    {isAdmin
                      ? "可咨询报销政策、审批规则与系统使用问题"
                      : "可以咨询报销政策，或上传发票图片/PDF 自动识别填单"}
                  </p>
                  {!isAdmin && (
                  <button
                    type="button"
                    className="chat-welcome-upload"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <CloudUploadOutlined />
                    上传发票
                  </button>
                  )}
                </div>
              )}
              {messages.map((msg) => {
                if (msg.role === "assistant" && msg.streaming && !msg.content) {
                  const extract = getExtractPayload(msg.data);
                  if (!extract) return null;
                }
                const extractPayload =
                  msg.type === "reimbursement_extract"
                    ? getExtractPayload(msg.data)
                    : null;
                const isWideCard = Boolean(extractPayload);
                return (
                  <motion.div
                    key={msg.id}
                    className={`message ${msg.role}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div
                      className={`message-content ${isWideCard ? "message-content-wide" : ""} ${msg.attachments?.length ? "message-content-with-files" : ""}`}
                    >
                      {msg.role === "assistant" ? (
                        <>
                          {msg.content ? (
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                          ) : null}
                          {msg.type === "reimbursement_type" && msg.data ? (
                            <ReimbursementTypeCard
                              drafts={normalizeTypeDrafts(msg.data)}
                            />
                          ) : null}
                          {extractPayload
                            ? renderExtractCardsForMessage(
                                msg.id,
                                extractPayload,
                                msg.streaming,
                              )
                            : null}
                        </>
                      ) : (
                        <>
                          {msg.attachments?.length ? (
                            <FileAttachmentBubble attachments={msg.attachments} />
                          ) : null}
                        </>
                      )}
                    </div>
                  </motion.div>
                );
              })}
              {isLoading &&
                messages.some(
                  (m) => m.role === "assistant" && m.streaming && !m.content,
                ) && (
                  <div className="message assistant">
                    <div className="message-content typing">
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                )}
              <div ref={messagesEndRef} />
            </div>

            <div
              className={`chat-input-area ${isDragOver && !isAdmin ? "chat-input-area-dragover" : ""}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <PendingFilesStrip
                items={pendingFiles}
                recognizing={recognizing}
                onRemove={removePendingFile}
                onRecognize={handleStartRecognize}
              />
              <div className="chat-input">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf"
                multiple
                className="hidden-file-input"
                onChange={handleFileSelect}
              />
              <motion.button
                type="button"
                className="attach-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading || recognizing}
                title={isAdmin ? "管理员请使用「填写报销单」页面上传发票" : "上传发票图片或 PDF"}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
              >
                <CloudUploadOutlined />
              </motion.button>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder={isAdmin ? "输入消息，咨询报销政策…" : "输入消息，或点击左侧按钮上传发票…"}
                disabled={isLoading || recognizing}
              />
              <motion.button
                type="button"
                className="send-btn"
                onClick={handleSend}
                disabled={isLoading || recognizing || !input.trim()}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
              >
                <SendOutlined />
              </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

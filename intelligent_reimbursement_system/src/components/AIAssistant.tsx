import { useState, useRef, useEffect } from "react";
import { message as antdMessage } from "antd";
import { RobotOutlined, CloseOutlined, SendOutlined } from "@ant-design/icons";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { useNavigate } from "react-router-dom";
import { chatStreamFetch } from "../api/ai";
import { useAIStore } from "../store/useAIStore";
import { useAuthStore } from "../store/useAuthStore";
import type { AIReimbursementTypeDraft } from "../store/useAIStore";
import "./AIAssistant.css";

type MessageType =
  | "chat"
  | "reimbursement_type"
  | "invoice_recognition"
  | "error";

interface InvoiceResult {
  is_invoice: boolean;
  origin_file_name: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  type?: MessageType;
  data?: unknown;
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
  // 按 code 去重
  const seen = new Set<string>();
  return list.filter((item) => {
    if (seen.has(item.code)) return false;
    seen.add(item.code);
    return true;
  });
}

// 报销类型结果卡片
function ReimbursementTypeCard({
  drafts,
}: {
  drafts: AIReimbursementTypeDraft[];
}) {
  if (!drafts.length) return null;
  return (
    <div className="result-card">
      <div className="result-card-title">📋 共生成 {drafts.length} 个报销类型</div>
      {drafts.map((d, idx) => (
        <div key={`${d.code}-${idx}`} className="result-card-row">
          {idx + 1}. {d.name} · {d.label}（{d.code}） · 字段 {(d.fields ?? []).length} 个
        </div>
      ))}
    </div>
  );
}

// 发票识别结果卡片
function InvoiceResultCard({ data }: { data: unknown }) {
  const list = data as InvoiceResult[];
  if (!Array.isArray(list)) return null;
  return (
    <div className="result-card">
      <div className="result-card-title">🧾 发票识别结果</div>
      {list.map((item, i) => (
        <div key={i} className="result-card-row">
          {item.is_invoice ? "✅" : "❌"} {item.origin_file_name}
        </div>
      ))}
    </div>
  );
}

export default function AIAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const setReimbursementTypeDraft = useAIStore(
    (s) => s.setReimbursementTypeDraft,
  );
  const menus = useAuthStore((s) => s.menus);

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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userInput = input;
    setMessages((prev) => [...prev, { role: "user", content: userInput }]);
    setInput("");
    setIsLoading(true);

    // 先插入一条空的 assistant 消息，后续流式追加
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "", streaming: true },
    ]);

    try {
      const stream = chatStreamFetch({ message: userInput });
      let fullContent = "";

      for await (const chunk of stream) {
        // 仅打印助手回复的数据结构，不打印用户输入内容
        console.groupCollapsed("[AI聊天回复] chunk");
        console.log("done =>", chunk.done);
        console.log("type =>", chunk.type);
        console.log("message =>", chunk.message);
        console.log("token =>", chunk.token);
        console.log("data =>", chunk.data);
        try {
          console.log("chunk json =>", JSON.stringify(chunk, null, 2));
        } catch (e) {
          console.warn("chunk stringify failed =>", e);
        }
        console.groupEnd();

        if (!chunk.done && chunk.token) {
          fullContent += chunk.token;
          // 更新最后一条消息内容（渐显效果）
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: "assistant",
              content: fullContent,
              streaming: true,
            };
            return updated;
          });
        }

        if (chunk.done) {
          // 流结束，根据类型保存结构化数据
          const type = (chunk.type as MessageType) || "chat";
          const finalContent =
            type === "reimbursement_type"
              ? chunk.message || "报销类型已生成"
              : type === "invoice_recognition"
                ? chunk.message || "发票识别完成"
                : chunk.message || fullContent || "处理完成";

          // 报销类型结果写入 store 并自动跳转
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

          console.groupCollapsed("[AI聊天回复] done汇总");
          console.log("final type =>", type);
          console.log("final content =>", finalContent);
          console.log("final data =>", chunk.data);
          try {
            console.log(
              "final data json =>",
              chunk.data == null ? null : JSON.stringify(chunk.data, null, 2),
            );
          } catch (e) {
            console.warn("final data stringify failed =>", e);
          }
          console.groupEnd();

          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: "assistant",
              content: finalContent,
              streaming: false,
              type,
              data: chunk.data,
            };
            return updated;
          });
        }
      }
    } catch {
      antdMessage.error("处理失败，请稍后再试");
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: "抱歉，处理出错了，请稍后再试",
          streaming: false,
        };
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
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
            initial={{ scale: 0.5, opacity: 0, y: 20, transformOrigin: "bottom right" }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.5, opacity: 0, y: 20 }}
            transition={{ type: "spring", stiffness: 350, damping: 25 }}
          >
            <div className="chat-header">
              <div className="header-title">
                <RobotOutlined style={{ fontSize: 18 }} />
                <span>智能助手</span>
              </div>
              <motion.button
                className="close-btn"
                onClick={() => setIsOpen(false)}
                whileHover={{ scale: 1.1, rotate: 90 }}
                whileTap={{ scale: 0.9 }}
              >
                <CloseOutlined style={{ fontSize: 14 }} />
              </motion.button>
            </div>

            <div className="chat-messages">
              {messages.map((msg, idx) => {
                if (msg.role === "assistant" && msg.streaming && !msg.content) {
                  return null;
                }
                return (
                  <motion.div
                    key={idx}
                    className={`message ${msg.role}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="message-content">
                      {msg.role === "assistant" ? (
                        <>
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                          {msg.type === "reimbursement_type" && msg.data && (
                            <ReimbursementTypeCard
                              drafts={normalizeTypeDrafts(msg.data)}
                            />
                          )}
                          {msg.type === "invoice_recognition" && msg.data && (
                            <InvoiceResultCard data={msg.data} />
                          )}
                        </>
                      ) : (
                        msg.content
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

            <div className="chat-input">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="输入消息..."
                disabled={isLoading}
              />
              <motion.button
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
              >
                <SendOutlined />
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

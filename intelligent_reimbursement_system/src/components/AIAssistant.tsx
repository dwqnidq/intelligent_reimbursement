import { useState, useRef, useEffect } from "react";
import { message as antdMessage } from "antd";
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

// 报销类型结果卡片
function ReimbursementTypeCard({
  data,
  onApply,
}: {
  data: unknown;
  onApply: () => void;
}) {
  const d = data as Record<string, unknown>;
  if (!d) return null;
  return (
    <div className="result-card">
      <div className="result-card-title">
        📋 {d.label as string}（{d.code as string}）
      </div>
      <div className="result-card-row">
        上限金额：¥{d.over_limit_threshold as number}
      </div>
      <div className="result-card-row">
        字段：
        {(d.fields as { label: string }[])?.map((f) => f.label).join("、")}
      </div>
      <button className="result-card-apply" onClick={onApply}>
        一键填入表单 →
      </button>
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
    if (isOpen && messages.length === 0) {
      setMessages([
        { role: "assistant", content: "你好，我是小智，是你的智能报销助手" },
      ]);
    }
  }, [isOpen, messages.length]);

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

          // 报销类型结果写入 store
          if (type === "reimbursement_type" && chunk.data) {
            setReimbursementTypeDraft(chunk.data as AIReimbursementTypeDraft);
          }

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
      <div
        className={`ai-assistant-button ${isOpen ? "hidden" : ""}`}
        onClick={() => setIsOpen(true)}
      >
        <div className="avatar-container">
          <svg className="avatar-animation" viewBox="0 0 100 100">
            <circle cx="50" cy="35" r="15" fill="#4F46E5" />
            <ellipse cx="50" cy="65" rx="20" ry="25" fill="#4F46E5" />
            <circle cx="45" cy="32" r="2" fill="white" />
            <circle cx="55" cy="32" r="2" fill="white" />
            <path
              d="M 45 40 Q 50 43 55 40"
              stroke="white"
              strokeWidth="2"
              fill="none"
            />
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0 50 50"
              to="360 50 50"
              dur="3s"
              repeatCount="indefinite"
            />
          </svg>
        </div>
      </div>

      {isOpen && (
        <div className="ai-assistant-chat">
          <div className="chat-header">
            <div className="header-title">
              <span className="avatar-small">🤖</span>
              <span>小智助手</span>
            </div>
            <button className="close-btn" onClick={() => setIsOpen(false)}>
              ×
            </button>
          </div>

          <div className="chat-messages">
            {messages.map((msg, idx) => (
              <div key={idx} className={`message ${msg.role}`}>
                <div
                  className={`message-content ${msg.streaming ? "streaming" : ""}`}
                >
                  {msg.role === "assistant" ? (
                    <>
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                      {msg.type === "reimbursement_type" && msg.data && (
                        <ReimbursementTypeCard
                          data={msg.data}
                          onApply={() => {
                            setReimbursementTypeDraft(
                              msg.data as AIReimbursementTypeDraft,
                            );
                            const path = findTypeCreatePath();
                            // 已在目标页面则不跳转，store 变化会直接触发表单填充
                            if (path && window.location.pathname !== path) {
                              navigate(path);
                            }
                            setIsOpen(false);
                          }}
                        />
                      )}
                      {msg.type === "invoice_recognition" && msg.data && (
                        <InvoiceResultCard data={msg.data} />
                      )}
                    </>
                  ) : (
                    msg.content
                  )}
                  {msg.streaming && <span className="cursor" />}
                </div>
              </div>
            ))}
            {isLoading &&
              messages[messages.length - 1]?.role !== "assistant" && (
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
            <button onClick={handleSend} disabled={isLoading || !input.trim()}>
              发送
            </button>
          </div>
        </div>
      )}
    </>
  );
}

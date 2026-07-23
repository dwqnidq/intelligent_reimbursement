import { Select } from "antd";
import { useEffect, useRef, useState } from "react";
import type { ReimbursementType } from "../api/reimbursement";
import type {
  RecognitionInvoiceItem,
  ResultCardMode,
} from "../utils/reimbursementRecognition";
import { progressPercent } from "../utils/aiProgress";
import "./ReimbursementChatCards.css";

type BannerVariant = "teal" | "blue" | "amber" | "green" | "slate";

const STREAM_TYPE_MS = 28;

function Banner({
  variant,
  tag,
  title,
  subtitle,
}: {
  variant: BannerVariant;
  tag: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className={`rc-banner ${variant}`}>
      <div className="rc-tag">{tag}</div>
      <h4>{title}</h4>
      {subtitle ? <p>{subtitle}</p> : null}
    </div>
  );
}

function highlightStage(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(
      /(准备识别…|OCR 识别中|OCR 完成|字段提取中|类型匹配中|发票判定中|发票判定完成|提取失败|识别完成|未读取到启用的报销类型)/g,
      '<span class="rc-stream-stage">$1</span>',
    );
}

function StreamLogViewport({ lines }: { lines: string[] }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [doneLines, setDoneLines] = useState<string[]>([]);
  const [current, setCurrent] = useState("");
  const [showCursor, setShowCursor] = useState(false);
  const doneCountRef = useRef(0);

  // 行被清空时重置
  useEffect(() => {
    if (lines.length === 0) {
      doneCountRef.current = 0;
      setDoneLines([]);
      setCurrent("");
      setShowCursor(false);
    }
  }, [lines.length]);

  // 逐行打字：只依赖「已完成行数」与「目标行内容」，避免 kick/typingRef 死锁
  const pendingIndex = doneLines.length;
  const pendingLine = lines[pendingIndex];

  useEffect(() => {
    if (lines.length === 0) return;
    if (pendingIndex >= lines.length) {
      setShowCursor(false);
      setCurrent("");
      return;
    }
    if (pendingLine == null) return;

    let cancelled = false;
    let i = 0;
    setShowCursor(true);
    setCurrent("");

    const timer = window.setInterval(() => {
      if (cancelled) return;
      i += 1;
      setCurrent(pendingLine.slice(0, i));
      if (i >= pendingLine.length) {
        window.clearInterval(timer);
        if (cancelled) return;
        doneCountRef.current = pendingIndex + 1;
        setDoneLines((prev) =>
          prev.length === pendingIndex ? [...prev, pendingLine] : prev,
        );
        setCurrent("");
        setShowCursor(false);
      }
    }, STREAM_TYPE_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [lines.length, pendingIndex, pendingLine]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [doneLines, current]);

  return (
    <div className="rc-stream-box" ref={boxRef} aria-live="polite">
      {doneLines.map((line, idx) => (
        <p
          key={`done-${idx}`}
          className="rc-stream-line"
          dangerouslySetInnerHTML={{ __html: highlightStage(line) }}
        />
      ))}
      {current || showCursor ? (
        <p className="rc-stream-line">
          <span dangerouslySetInnerHTML={{ __html: highlightStage(current) }} />
          {showCursor ? <span className="rc-stream-cursor" /> : null}
        </p>
      ) : null}
      {lines.length === 0 && doneLines.length === 0 ? (
        <p className="rc-stream-line rc-stream-line-muted">等待识别…</p>
      ) : null}
    </div>
  );
}

export function ProgressCard({
  done,
  total,
  lines,
}: {
  done: number;
  total: number;
  lines?: string[];
}) {
  const percent = progressPercent(done, total);
  const logLines = lines?.length
    ? lines
    : [`正在识别发票… ${done}/${total}`];
  return (
    <div className="rc-card">
      <Banner variant="blue" tag="处理中" title="正在识别发票" />
      <div className="rc-body">
        <StreamLogViewport lines={logLines} />
        <div className="rc-progress-meta">
          <span className="rc-progress-label">识别进度 {percent}%</span>
          <span className="rc-progress-frac">
            {done}/{total}
          </span>
        </div>
        <div className="rc-progress">
          <i style={{ width: `${percent}%` }} />
        </div>
      </div>
    </div>
  );
}


function StatusBadge({ item }: { item: RecognitionInvoiceItem }) {
  if (item.duplicate) {
    return (
      <span className="rc-badge danger">
        {item.duplicateKind === "batch" ? "本批重复" : "已上传"}
      </span>
    );
  }
  if (item.matched) {
    return <span className="rc-badge ok">已匹配</span>;
  }
  if (item.categoryId) {
    return <span className="rc-badge info">已选择</span>;
  }
  return <span className="rc-badge warn">未匹配</span>;
}

function InvoiceRow({
  item,
  types,
  onSelectType,
}: {
  item: RecognitionInvoiceItem;
  types: ReimbursementType[];
  onSelectType?: (fileIndex: number, categoryId: string) => void;
}) {
  const needsTypeSelect = !item.duplicate && !item.categoryId && Boolean(onSelectType);
  const rowClass = item.duplicate
    ? "rc-invoice danger"
    : !item.matched && !item.categoryId
      ? "rc-invoice warn"
      : "rc-invoice";

  const displayLabel = item.duplicate
    ? item.categoryLabel
    : item.matched
      ? item.categoryLabel
      : item.isSuggested
        ? `建议：${item.categoryLabel}`
        : item.categoryLabel && item.categoryLabel !== "未识别到报销类型"
          ? item.categoryLabel
          : "未识别到报销类型";

  return (
    <div className={rowClass}>
      <div className="rc-invoice-top">
        <div className="title">
          {displayLabel}
          <StatusBadge item={item} />
        </div>
        <div className="amount">¥{item.amount.toFixed(2)}</div>
      </div>
      <div className="rc-kv">
        <div className="k">文件</div>
        <div className="v">{item.fileName}</div>
        {item.invoiceNumber ? (
          <>
            <div className="k">发票号</div>
            <div className="v">{item.invoiceNumber}</div>
          </>
        ) : null}
        {item.issuer ? (
          <>
            <div className="k">开票方</div>
            <div className="v">{item.issuer}</div>
          </>
        ) : null}
        {item.invoiceDate ? (
          <>
            <div className="k">日期</div>
            <div className="v">{item.invoiceDate}</div>
          </>
        ) : null}
        {item.duplicate ? (
          <>
            <div className="k">原因</div>
            <div className="v">
              {item.fillError ||
                (item.duplicateKind === "batch"
                  ? "与本批其他文件为同一张发票"
                  : "该发票号已存在报销记录")}
            </div>
          </>
        ) : !item.matched && !item.categoryId ? (
          <>
            <div className="k">原因</div>
            <div className="v">系统中无对应报销类型</div>
          </>
        ) : null}
      </div>
      {needsTypeSelect ? (
        <div className="rc-field">
          <label>请选择报销类型</label>
          {types.length > 0 ? (
            <Select
              className="rc-type-select"
              placeholder="未识别到报销类型，请手动选择"
              value={item.categoryId || undefined}
              onChange={(v) => onSelectType?.(item.fileIndex, v)}
              options={types.map((t) => ({
                value: t._id,
                label: t.label || t.name,
              }))}
              size="small"
              getPopupContainer={(node) => node.parentElement ?? document.body}
              popupMatchSelectWidth
            />
          ) : (
            <div className="rc-alert warn" style={{ marginTop: 0 }}>
              报销类型加载中，请稍候…
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function ResultCard({
  items,
  skippedNames,
  mode,
  types,
  onSelectType,
  onSubmit,
  onCancel,
  submitting,
  submitLabel,
}: {
  items: RecognitionInvoiceItem[];
  skippedNames?: string[];
  mode: ResultCardMode;
  types: ReimbursementType[];
  onSelectType?: (fileIndex: number, categoryId: string) => void;
  onSubmit?: () => void;
  onCancel?: () => void;
  submitting?: boolean;
  /** 覆盖主按钮文案（如二次填单后的「确认提交」） */
  submitLabel?: string;
}) {
  const submittable = items.filter((i) => !i.duplicate);
  const readyCount = submittable.filter((i) => i.categoryId).length;
  const total = submittable.reduce((s, i) => s + i.amount, 0);
  const needsTypeSelection = submittable.some((i) => !i.categoryId);
  const allUnmatched =
    submittable.length > 0 && submittable.every((i) => !i.matched && !i.categoryId);

  const canSubmitPartial =
    mode === "has_duplicate" || mode === "has_unmatched";
  const canSubmit = canSubmitPartial
    ? readyCount > 0
    : mode === "all_unmatched"
      ? readyCount > 0 && readyCount === submittable.length
      : readyCount > 0 && !needsTypeSelection;

  const bannerVariant: BannerVariant =
    mode === "has_duplicate"
      ? "amber"
      : mode === "all_unmatched" || needsTypeSelection
        ? "amber"
        : "teal";

  const tag =
    mode === "has_duplicate"
      ? "需确认"
      : allUnmatched
        ? "需处理"
        : needsTypeSelection
          ? "需处理"
          : "识别完成";

  const title =
    mode === "has_duplicate"
      ? "发现重复发票"
      : allUnmatched
        ? "未识别到报销类型"
        : `${readyCount} 张发票可提交`;

  const subtitle =
    mode === "has_duplicate"
      ? readyCount > 0
        ? `可跳过重复项，提交其余 ${readyCount} 张`
        : "请为未匹配的发票选择报销类型"
      : allUnmatched
        ? "请为每张发票手动选择报销类型"
        : `合计 ¥${total.toFixed(2)} · 请核对后确认报销`;

  const primaryLabel =
    submitLabel ??
    (mode === "has_duplicate"
      ? "跳过重复并提交"
      : needsTypeSelection && readyCount > 0
        ? "仅提交已就绪"
        : "确认报销");

  return (
    <div className="rc-card">
      <Banner variant={bannerVariant} tag={tag} title={title} subtitle={subtitle} />
      <div className="rc-body">
        {items.map((item) => (
          <InvoiceRow
            key={item.fileIndex}
            item={item}
            types={types}
            onSelectType={onSelectType}
          />
        ))}
        {skippedNames && skippedNames.length > 0 ? (
          <div className="rc-alert warn">
            <strong>未处理文件：</strong>
            {skippedNames.join("、")}
          </div>
        ) : null}
        {needsTypeSelection ? (
          <div className="rc-alert warn">
            <strong>未识别到报销类型。</strong>
            请为未匹配的发票手动选择类型；已就绪的可先提交。
          </div>
        ) : null}
        {mode === "has_duplicate" ? (
          <div className="rc-alert danger">
            重复发票不会进入报销单。可取消本批，或仅提交未重复的发票。
          </div>
        ) : null}
        <div className="rc-actions">
          {(onSubmit || onCancel) ? (
            <>
              {onSubmit ? (
                <button
                  type="button"
                  className="rc-btn primary"
                  disabled={!canSubmit || submitting}
                  onClick={onSubmit}
                >
                  {submitting ? "提交中…" : primaryLabel}
                </button>
              ) : null}
              {onCancel ? (
                <button
                  type="button"
                  className="rc-btn secondary"
                  disabled={submitting}
                  onClick={onCancel}
                >
                  取消
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function SuccessCard({
  count,
  totalAmount,
  onViewList,
  onDismiss,
}: {
  count: number;
  totalAmount: number;
  onViewList?: () => void;
  onDismiss?: () => void;
}) {
  return (
    <div className="rc-card">
      <Banner
        variant="green"
        tag="已提交"
        title="报销申请已创建"
        subtitle={`${count} 笔 · 合计 ¥${totalAmount.toFixed(2)} · 已进入审批流程`}
      />
      <div className="rc-body">
        <div className="rc-stat-row">
          <div className="rc-stat">
            <b>{count}</b>
            <span>单据</span>
          </div>
          <div className="rc-stat">
            <b>¥{totalAmount.toFixed(0)}</b>
            <span>总额</span>
          </div>
          <div className="rc-stat">
            <b>审批中</b>
            <span>状态</span>
          </div>
        </div>
        <div className="rc-alert ok">
          可在「我的报销」查看进度；审批人将收到待办通知。
        </div>
        <div className="rc-actions">
          {onViewList ? (
            <button type="button" className="rc-btn primary" onClick={onViewList}>
              查看报销单
            </button>
          ) : null}
          {onDismiss ? (
            <button type="button" className="rc-btn secondary" onClick={onDismiss}>
              完成
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function NoRecognizableCard({
  skippedNames,
  onDismiss,
}: {
  skippedNames: string[];
  onDismiss?: () => void;
}) {
  return (
    <div className="rc-card">
      <Banner
        variant="slate"
        tag="未开始识别"
        title="未发现可识别文件"
        subtitle="请发送图片或 PDF"
      />
      <div className="rc-body">
        {skippedNames.length > 0 ? (
          <div className="rc-alert warn">
            <strong>已跳过：</strong>
            {skippedNames.join("、")}
          </div>
        ) : null}
        {onDismiss ? (
          <div className="rc-actions">
            <button type="button" className="rc-btn secondary" onClick={onDismiss}>
              我知道了
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ProfileGapCard({
  missing,
  onGoProfile,
}: {
  missing: string[];
  onGoProfile?: () => void;
}) {
  return (
    <div className="rc-card">
      <Banner
        variant="slate"
        tag="资料待完善"
        title={`还差 ${missing.length} 项才能提交`}
        subtitle="识别已完成，请补全资料后继续报销"
      />
      <div className="rc-body">
        <div className="rc-alert danger">
          <strong>缺少：</strong>
          {missing.join("、")}
        </div>
        {onGoProfile ? (
          <div className="rc-actions">
            <button type="button" className="rc-btn primary" onClick={onGoProfile}>
              去个人中心补全
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

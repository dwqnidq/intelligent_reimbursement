export type AiProgressStage =
  | "prepare"
  | "ocr"
  | "extract"
  | "match"
  | "done"
  | string;

export type AiProgress = {
  done: number;
  total: number;
  stage?: AiProgressStage;
  message?: string;
  /** 1-based index of the file that just completed (parallel-safe) */
  file_index?: number;
};

function isValidProgressNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function normalizeProgress(p: unknown): AiProgress | null {
  if (!p || typeof p !== "object") return null;
  const row = p as Partial<AiProgress>;
  if (!isValidProgressNumber(row.done) || !isValidProgressNumber(row.total)) {
    return null;
  }
  const out: AiProgress = { done: row.done, total: row.total };
  if (typeof row.stage === "string" && row.stage.trim()) {
    out.stage = row.stage.trim();
  }
  if (typeof row.message === "string" && row.message.trim()) {
    out.message = row.message.trim();
  }
  if (
    typeof row.file_index === "number" &&
    Number.isFinite(row.file_index) &&
    row.file_index > 0
  ) {
    out.file_index = Math.floor(row.file_index);
  }
  return out;
}

export function progressPercent(done: number, total: number): number {
  if (!isValidProgressNumber(done) || !isValidProgressNumber(total) || total === 0) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round((done / total) * 100)));
}

/** 旧进度帧无 message 时的默认文案 */
export function defaultProgressMessage(progress: AiProgress): string {
  if (progress.message?.trim()) return progress.message.trim();
  const { done, total, stage } = progress;
  const frac = `${done}/${total}`;
  switch (stage) {
    case "prepare":
      return `准备识别… 共 ${total} 个文件`;
    case "ocr":
      return `OCR 识别中 · 共 ${total} 张`;
    case "extract":
      return `字段提取中 · 进度 ${frac}`;
    case "match":
      return `类型匹配中 · 进度 ${frac}`;
    case "done":
      return "识别完成，正在整理结果…";
    default:
      return `正在识别发票… ${frac}`;
  }
}

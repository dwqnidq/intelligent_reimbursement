type ProgressFields = {
  done: number;
  total: number;
  stage?: string;
  message?: string;
  file_index?: number;
};

type ProgressTokenPayload = {
  type?: unknown;
  progress?: {
    done?: unknown;
    total?: unknown;
    stage?: unknown;
    message?: unknown;
    file_index?: unknown;
  };
};

function parseProgressToken(token: string | undefined): ProgressFields | null {
  if (!token) return null;
  try {
    const parsed = JSON.parse(token) as ProgressTokenPayload;
    if (parsed.type !== 'progress' || !parsed.progress) return null;
    const done = parsed.progress.done;
    const total = parsed.progress.total;
    if (typeof done !== 'number' || typeof total !== 'number') return null;
    const out: ProgressFields = { done, total };
    if (typeof parsed.progress.stage === 'string' && parsed.progress.stage.trim()) {
      out.stage = parsed.progress.stage.trim();
    }
    if (
      typeof parsed.progress.message === 'string' &&
      parsed.progress.message.trim()
    ) {
      out.message = parsed.progress.message.trim();
    }
    const fileIndex = parsed.progress.file_index;
    if (
      typeof fileIndex === 'number' &&
      Number.isFinite(fileIndex) &&
      fileIndex > 0
    ) {
      out.file_index = Math.floor(fileIndex);
    }
    return out;
  } catch {
    return null;
  }
}

/** 解析 gRPC/SSE 进度 token（供飞书 Bot 等非 SSE 消费方复用） */
export function parseAiProgressToken(
  token: string | undefined,
): ProgressFields | null {
  return parseProgressToken(token);
}

export type AiProgressFields = ProgressFields;

export function buildNonFinalSsePayload(chunk: {
  node?: string;
  token?: string;
}): string {
  const progress = parseProgressToken(chunk.token);
  if (progress) {
    return JSON.stringify({
      done: false,
      type: 'progress',
      node: chunk.node,
      progress,
    });
  }
  return JSON.stringify({
    done: false,
    token: chunk.token,
    node: chunk.node,
  });
}

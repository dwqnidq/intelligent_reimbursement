export interface ChatRequest {
  message: string;
  files?: string[]; // 格式：'filename::base64content'
}

export interface StreamChunk {
  done: boolean;
  token?: string;
  node?: string;
  type?: string;
  message?: string;
  data?: unknown;
}

function getToken(): string {
  try {
    const raw = localStorage.getItem("auth-storage");
    return raw ? (JSON.parse(raw)?.state?.token ?? "") : "";
  } catch {
    return "";
  }
}

/** 将 File 转为 'filename::base64content' 格式 */
export function fileToBase64Entry(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // result 格式：data:image/jpeg;base64,/9j/4AAQ...
      // 只取逗号后面的纯 base64 部分
      const base64 = (reader.result as string).split(",")[1];
      resolve(`${file.name}::${base64}`);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function* chatStreamFetch(
  data: ChatRequest,
): AsyncGenerator<StreamChunk> {
  const response = await fetch("/api/ai/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok || !response.body) {
    throw new Error("请求失败");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("data:")) {
        const jsonStr = line.slice(5).trim();
        if (jsonStr) {
          try {
            yield JSON.parse(jsonStr) as StreamChunk;
          } catch {
            // ignore malformed lines
          }
        }
      }
    }
  }
}

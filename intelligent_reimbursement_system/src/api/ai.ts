/** 与 LangGraph `REIMBURSEMENT_FORM_EXTRACT_TRIGGER` 保持一致 */
export const REIMBURSEMENT_FORM_EXTRACT_MESSAGE = '[[reimbursement_form_extract]]';

export interface AiReimbursementFormField {
	key: string;
	label: string;
	type: string;
	required?: boolean;
	options?: { label: string; value: string }[];
	sort?: number;
	is_calculate?: boolean;
	value?: unknown;
}

export interface AiReimbursementFormExtractRow {
	label: string;
	fields: AiReimbursementFormField[];
	over_limit_threshold?: number;
	fill_error?: string;
	is_suggested_type?: boolean;
	suggested_type_code?: string | null;
}

export type AiReimbursementFormExtractPayload =
	| AiReimbursementFormExtractRow[][]
	| AiReimbursementFormExtractRow[]
	| AiReimbursementFormExtractRow;

export interface ChatRequest {
	message: string;
	files?: string[];
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
		const raw = localStorage.getItem('auth-storage');
		return raw ? (JSON.parse(raw)?.state?.token ?? '') : '';
	} catch {
		return '';
	}
}

export function fileToBase64Entry(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const base64 = (reader.result as string).split(',')[1];
			resolve(`${file.name}::${base64}`);
		};
		reader.onerror = reject;
		reader.readAsDataURL(file);
	});
}

export async function* chatStreamFetch(data: ChatRequest): AsyncGenerator<StreamChunk> {
	const response = await fetch('/api/ai/chat', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${getToken()}`,
		},
		body: JSON.stringify(data),
	});

	if (!response.ok || !response.body) {
		throw new Error('请求失败');
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;

		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split('\n');
		buffer = lines.pop() ?? '';

		for (const line of lines) {
			if (line.startsWith('data:')) {
				const jsonStr = line.slice(5).trim();
				if (jsonStr) {
					try {
						yield JSON.parse(jsonStr) as StreamChunk;
					} catch {
						// ignore
					}
				}
			}
		}
	}
}

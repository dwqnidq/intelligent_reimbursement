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
	invoice_number?: string;
	invoice_title?: string;
	invoice_date?: string;
	issuer?: string;
	invoice_duplicate?: boolean;
	/** 与本批其他文件发票号码重复（非历史已上传） */
	invoice_batch_duplicate?: boolean;
	/** 原票 OCR，供手动选类型后二次填单 */
	ocr_text?: string;
}

export type AiReimbursementFormExtractPayload =
	| AiReimbursementFormExtractRow[][]
	| AiReimbursementFormExtractRow[]
	| AiReimbursementFormExtractRow;

export interface FillTypeFieldsRequest {
	typeJson: string;
	ocrText: string;
	knownAmount?: number;
}

export interface FillTypeFieldsResult {
	label?: string;
	fields?: AiReimbursementFormField[];
	is_suggested_type?: boolean;
}

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
	progress?: { done: number; total: number; stage?: string; message?: string; file_index?: number };
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

/** 手动选类型后的二次填单（soft-fill）；超时放宽以等待模型 */
export async function fillTypeFields(
	params: FillTypeFieldsRequest,
): Promise<FillTypeFieldsResult> {
	const response = await fetch('/api/ai/fill-type-fields', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${getToken()}`,
		},
		body: JSON.stringify(params),
		signal: AbortSignal.timeout(180_000),
	});
	if (!response.ok) {
		throw new Error('二次填单失败');
	}
	const body = (await response.json()) as {
		code?: number;
		message?: string;
		data?: FillTypeFieldsResult;
	};
	if (body.code !== undefined && body.code !== 0 && body.code !== 200) {
		throw new Error(body.message ?? '二次填单失败');
	}
	return body.data ?? (body as FillTypeFieldsResult);
}

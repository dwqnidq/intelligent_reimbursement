import type {
	AiReimbursementFormExtractPayload,
	AiReimbursementFormExtractRow,
	AiReimbursementFormField,
	FillTypeFieldsResult,
} from '../api/ai';
import type { InvoiceInfoParams } from '../api/reimbursement';
import type { ReimbursementType } from '../api/reimbursement';

export type FileSlotRecognitionSummary = {
	fileIndex: number;
	fileName?: string;
	label: string;
	rowCount: number;
	matched: boolean;
	isSuggested: boolean;
	over_limit_threshold?: number | null;
	fillError?: string;
	invoiceNumber?: string;
	invoiceTitle?: string;
	invoiceDate?: string;
	issuer?: string;
	invoiceDuplicate?: boolean;
	invoiceBatchDuplicate?: boolean;
	invoiceInfo?: InvoiceInfoParams;
	/** 用户手动选择的报销类型 ID */
	userSelectedCategoryId?: string;
	/** 原票 OCR，供二次填单 */
	ocrText?: string;
	/** 已对当前所选类型完成二次填单（再改类型会清掉） */
	typeFillApplied?: boolean;
};

export type InvoiceDuplicateIssue = {
	kind: 'uploaded' | 'batch';
	invoiceNumber: string;
	fileNames: string[];
	fileIndices: number[];
};

export type RecognitionInvoiceItem = {
	fileIndex: number;
	fileName: string;
	categoryLabel: string;
	matched: boolean;
	isSuggested: boolean;
	amount: number;
	invoiceNumber?: string;
	invoiceTitle?: string;
	invoiceDate?: string;
	issuer?: string;
	duplicate: boolean;
	/** uploaded=历史已上传；batch=本批重复 */
	duplicateKind?: 'uploaded' | 'batch';
	fillError?: string;
	/** 已匹配或用户手动选择的类型 ID */
	categoryId?: string;
};

export function findReimbursementTypeByRecognition(
	types: ReimbursementType[],
	recognitionLabel: string,
): ReimbursementType | undefined {
	const key = recognitionLabel.trim();
	if (!key) return undefined;
	return types.find(
		(t) => t.label.trim() === key || t.name.trim() === key || t.code.trim() === key,
	);
}

export function normalizeExtractGroups(
	payload: AiReimbursementFormExtractPayload,
): AiReimbursementFormExtractRow[][] {
	if (payload == null || typeof payload !== 'object') return [];
	if (!Array.isArray(payload)) {
		return [[payload as AiReimbursementFormExtractRow]];
	}
	if (payload.length === 0) return [];
	const first = payload[0] as unknown;
	if (Array.isArray(first)) {
		return payload as AiReimbursementFormExtractRow[][];
	}
	return [payload as AiReimbursementFormExtractRow[]];
}

export function extractAmountFromRow(row?: AiReimbursementFormExtractRow): number {
	const fields = row?.fields ?? [];
	const calc = fields.find((f) => f.is_calculate);
	if (calc?.value != null) {
		const n = Number(calc.value);
		if (!Number.isNaN(n)) return n;
	}
	const amountField = fields.find((f) => /amount|金额|total/i.test(f.key));
	if (amountField?.value != null) {
		const n = Number(amountField.value);
		if (!Number.isNaN(n)) return n;
	}
	return 0;
}

function markBatchDuplicateSlots(
	summaries: FileSlotRecognitionSummary[],
): FileSlotRecognitionSummary[] {
	const seen = new Map<string, number>();
	const summaryByIndex = new Map(summaries.map((s) => [s.fileIndex, s]));
	return summaries.map((summary) => {
		if (summary.invoiceDuplicate || summary.invoiceBatchDuplicate) return summary;
		const invoiceNumber = summary.invoiceNumber?.trim();
		if (!invoiceNumber) return summary;
		const firstIndex = seen.get(invoiceNumber);
		if (firstIndex !== undefined) {
			const first = summaryByIndex.get(firstIndex);
			return {
				...summary,
				invoiceBatchDuplicate: true,
				label: summary.label || first?.label || '',
				matched: summary.matched || Boolean(first?.matched),
				fillError:
					summary.fillError ||
					`与本批其他文件发票号码重复：${invoiceNumber}`,
			};
		}
		seen.set(invoiceNumber, summary.fileIndex);
		return summary;
	});
}

export function buildFileSlotSummaries(
	groups: AiReimbursementFormExtractRow[][],
	types: ReimbursementType[],
	fileNames: string[] = [],
): FileSlotRecognitionSummary[] {
	const summaries = groups.map((g, fi) => {
		const duplicateRow = g.find((r) => r.invoice_duplicate);
		const rowsWithFields = g.filter((r) => (r.fields?.length ?? 0) > 0);
		const headRow = duplicateRow ?? rowsWithFields[0] ?? g[0];
		const label = String(headRow?.label ?? '').trim();
		const rowCount = rowsWithFields.length;
		const fillError = g.find((r) => r.fill_error)?.fill_error;
		const invoiceDuplicate = Boolean(duplicateRow?.invoice_duplicate ?? headRow?.invoice_duplicate);
		const invoiceBatchDuplicate = Boolean(
			headRow?.invoice_batch_duplicate ??
				(duplicateRow as { invoice_batch_duplicate?: boolean } | undefined)
					?.invoice_batch_duplicate,
		);
		const isSuggested =
			rowsWithFields.some((r) => r.is_suggested_type === true) ||
			Boolean(headRow?.is_suggested_type);
		const matched = Boolean(
			!invoiceDuplicate && label && findReimbursementTypeByRecognition(types, label),
		);
		const over_limit_threshold =
			typeof headRow?.over_limit_threshold === 'number' ? headRow.over_limit_threshold : null;
		const invoiceNumber = String(headRow?.invoice_number ?? '').trim() || undefined;
		const invoiceTitle = String(headRow?.invoice_title ?? '').trim() || undefined;
		const invoiceDate = String(headRow?.invoice_date ?? '').trim() || undefined;
		const issuer = String(headRow?.issuer ?? '').trim() || undefined;
		const invoiceInfo: InvoiceInfoParams | undefined = invoiceNumber
			? {
					invoice_number: invoiceNumber,
					...(invoiceTitle ? { invoice_title: invoiceTitle } : {}),
					...(invoiceDate ? { invoice_date: invoiceDate } : {}),
					...(issuer ? { issuer } : {}),
				}
			: undefined;
		const ocrText =
			g.map((r) => String(r.ocr_text ?? '').trim()).find((t) => t.length > 0) ||
			undefined;
		return {
			fileIndex: fi + 1,
			fileName: fileNames[fi] || undefined,
			label,
			rowCount,
			matched,
			isSuggested,
			over_limit_threshold,
			fillError,
			invoiceNumber,
			invoiceTitle,
			invoiceDate,
			issuer,
			invoiceDuplicate,
			invoiceBatchDuplicate,
			invoiceInfo,
			ocrText,
		};
	});
	return markBatchDuplicateSlots(summaries);
}

export function analyzeInvoiceDuplicateIssues(summaries: FileSlotRecognitionSummary[]): {
	issues: InvoiceDuplicateIssue[];
	indicesToRemove: number[];
} {
	const indicesToRemove = new Set<number>();
	const uploadedByInv = new Map<string, { fileNames: string[]; fileIndices: number[] }>();
	const batchByInv = new Map<string, { fileNames: string[]; fileIndices: number[] }>();
	const batchFirstSeen = new Map<string, { fileIndex: number; fileName: string }>();

	for (const summary of summaries) {
		const displayName = summary.fileName || `文件 ${summary.fileIndex}`;
		const invoiceNumber = summary.invoiceNumber?.trim() || '—';
		if (summary.invoiceDuplicate) {
			indicesToRemove.add(summary.fileIndex);
			const entry = uploadedByInv.get(invoiceNumber) ?? { fileNames: [], fileIndices: [] };
			entry.fileNames.push(displayName);
			entry.fileIndices.push(summary.fileIndex);
			uploadedByInv.set(invoiceNumber, entry);
		}
	}

	for (const summary of summaries) {
		if (summary.invoiceDuplicate) continue;
		const invoiceNumber = summary.invoiceNumber?.trim();
		if (!invoiceNumber) continue;
		const displayName = summary.fileName || `文件 ${summary.fileIndex}`;
		const first = batchFirstSeen.get(invoiceNumber);
		if (first) {
			indicesToRemove.add(summary.fileIndex);
			const entry = batchByInv.get(invoiceNumber) ?? {
				fileNames: [first.fileName],
				fileIndices: [first.fileIndex],
			};
			entry.fileNames.push(displayName);
			entry.fileIndices.push(summary.fileIndex);
			batchByInv.set(invoiceNumber, entry);
		} else {
			batchFirstSeen.set(invoiceNumber, {
				fileIndex: summary.fileIndex,
				fileName: displayName,
			});
		}
	}

	const issues: InvoiceDuplicateIssue[] = [];
	for (const [invoiceNumber, data] of uploadedByInv) {
		issues.push({ kind: 'uploaded', invoiceNumber, ...data });
	}
	for (const [invoiceNumber, data] of batchByInv) {
		issues.push({ kind: 'batch', invoiceNumber, ...data });
	}
	return { issues, indicesToRemove: [...indicesToRemove].sort((a, b) => a - b) };
}

export function resolveCategoryId(
	summary: FileSlotRecognitionSummary,
	types: ReimbursementType[],
): string | undefined {
	if (summary.invoiceDuplicate || summary.invoiceBatchDuplicate) return undefined;
	if (summary.userSelectedCategoryId) return summary.userSelectedCategoryId;
	if (summary.matched && summary.label) {
		return findReimbursementTypeByRecognition(types, summary.label)?._id;
	}
	return undefined;
}

export function isSummarySubmittable(
	summary: FileSlotRecognitionSummary,
	types: ReimbursementType[],
): boolean {
	if (summary.invoiceDuplicate || summary.invoiceBatchDuplicate) return false;
	if (summary.rowCount === 0 && !summary.label && !summary.userSelectedCategoryId) return false;
	return Boolean(resolveCategoryId(summary, types));
}

export function applyManualTypeSelection(
	summaries: FileSlotRecognitionSummary[],
	fileIndex: number,
	categoryId: string,
): FileSlotRecognitionSummary[] {
	return summaries.map((s) =>
		s.fileIndex === fileIndex
			? {
					...s,
					userSelectedCategoryId: categoryId,
					typeFillApplied: false,
				}
			: s,
	);
}

/** 未匹配选手动类型或改过类型，且尚未完成本次二次填单 */
export function needsTypeFieldFill(summary: FileSlotRecognitionSummary): boolean {
	if (summary.invoiceDuplicate || summary.invoiceBatchDuplicate) return false;
	if (!summary.userSelectedCategoryId) return false;
	return !summary.typeFillApplied;
}

export function pickOcrTextFromGroup(
	group: AiReimbursementFormExtractRow[] | undefined,
	fallback?: string,
): string {
	if (Array.isArray(group)) {
		for (const row of group) {
			const text = String(row.ocr_text ?? '').trim();
			if (text) return text;
		}
	}
	return String(fallback ?? '').trim();
}

/**
 * 将二次填单结果写回该文件的识别组：保留发票元数据与 OCR，字段改为 soft-fill 结果
 *（无合适值时可为 fields: []，由调用方用类型骨架展示空表单）。
 */
export function applyTypeFillToGroup(
	group: AiReimbursementFormExtractRow[],
	filled: FillTypeFieldsResult,
	typeLabel: string,
): AiReimbursementFormExtractRow[] {
	const head =
		group.find((r) => r.invoice_duplicate) ??
		group.find((r) => (r.fields?.length ?? 0) > 0) ??
		group[0];
	const ocrText = pickOcrTextFromGroup(group);
	const fields = Array.isArray(filled.fields) ? filled.fields : [];
	const row: AiReimbursementFormExtractRow = {
		label: String(filled.label ?? typeLabel).trim() || typeLabel,
		fields,
		is_suggested_type: false,
		invoice_number: head?.invoice_number,
		invoice_title: head?.invoice_title,
		invoice_date: head?.invoice_date,
		issuer: head?.issuer,
		invoice_duplicate: head?.invoice_duplicate,
		invoice_batch_duplicate: head?.invoice_batch_duplicate,
		over_limit_threshold: head?.over_limit_threshold,
		...(ocrText ? { ocr_text: ocrText } : {}),
	};
	return [row];
}

/** 用类型字段定义补齐填单结果骨架（无值也展示字段，避免空表单） */
export function mergeFilledFieldsWithTypeSkeleton(
	type: ReimbursementType,
	filledFields: AiReimbursementFormField[] | undefined,
): AiReimbursementFormField[] {
	const valueByKey = new Map<string, unknown>();
	for (const f of filledFields ?? []) {
		if (!f?.key) continue;
		if (f.value === undefined || f.value === null || f.value === '') continue;
		valueByKey.set(f.key, f.value);
	}
	const sorted = [...(type.fields ?? [])].sort((a, b) => a.sort - b.sort);
	return sorted.map((f, index) => ({
		key: f.key,
		label: f.label,
		type: f.type,
		required: f.required,
		options: f.options,
		sort: typeof f.sort === 'number' ? f.sort : index,
		is_calculate: f.is_calculate,
		...(valueByKey.has(f.key) ? { value: valueByKey.get(f.key) } : {}),
	}));
}

export function buildRecognitionInvoiceItems(
	groups: AiReimbursementFormExtractRow[][],
	summaries: FileSlotRecognitionSummary[],
	types: ReimbursementType[],
): RecognitionInvoiceItem[] {
	return summaries.map((summary) => {
		const group = groups[summary.fileIndex - 1] ?? [];
		const duplicateRow = group.find((r) => r.invoice_duplicate);
		const rowsWithFields = group.filter((r) => (r.fields?.length ?? 0) > 0);
		const headRow = duplicateRow ?? rowsWithFields[0] ?? group[0];
		const duplicate = Boolean(summary.invoiceDuplicate || summary.invoiceBatchDuplicate);
		const duplicateKind: RecognitionInvoiceItem['duplicateKind'] = duplicate
			? summary.invoiceBatchDuplicate
				? 'batch'
				: 'uploaded'
			: undefined;
		const categoryLabel = duplicate
			? duplicateKind === 'batch'
				? '本批重复发票'
				: '发票已上传'
			: summary.label || '未识别到报销类型';
		return {
			fileIndex: summary.fileIndex,
			fileName: summary.fileName ?? `文件 ${summary.fileIndex}`,
			categoryLabel,
			matched: duplicate ? false : summary.matched,
			isSuggested: summary.isSuggested,
			amount: extractAmountFromRow(headRow),
			invoiceNumber: summary.invoiceNumber,
			invoiceTitle: summary.invoiceTitle,
			invoiceDate: summary.invoiceDate,
			issuer: summary.issuer,
			duplicate,
			duplicateKind,
			fillError: summary.fillError,
			categoryId: resolveCategoryId(summary, types),
		};
	});
}

export type ResultCardMode =
	| 'ready'
	| 'has_unmatched'
	| 'all_unmatched'
	| 'has_duplicate';

export function resolveResultCardMode(
	items: Pick<RecognitionInvoiceItem, 'matched' | 'duplicate' | 'categoryId'>[],
): ResultCardMode {
	if (items.some((i) => i.duplicate)) return 'has_duplicate';
	const submittable = items.filter((i) => !i.duplicate);
	if (submittable.length === 0) return 'has_unmatched';
	const matchedCount = submittable.filter((i) => i.matched).length;
	const withSelection = submittable.filter((i) => i.categoryId).length;
	if (matchedCount === 0 && withSelection === 0) return 'all_unmatched';
	if (submittable.some((i) => !i.matched && !i.categoryId)) return 'has_unmatched';
	return 'ready';
}

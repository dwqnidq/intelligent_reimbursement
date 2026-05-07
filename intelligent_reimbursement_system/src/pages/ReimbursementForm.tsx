import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
	Form,
	Input,
	InputNumber,
	Select,
	DatePicker,
	Button,
	Card,
	message,
	Image,
	Spin,
	Segmented,
} from 'antd';
import { InboxOutlined, EyeOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd';
import {
	createReimbursement,
	getReimbursementTypes,
	type CreateReimbursementResult,
} from '../api/reimbursement';
import type { ReimbursementType, TypeField, FieldType } from '../api/reimbursement';
import { useAuthStore } from '../store/useAuthStore';
import { uploadFile } from '../api/file';
import FilePreviewModal from '../components/FilePreviewModal';
import ReimbursementTypeAttachmentRemarkSection from '../components/ReimbursementTypeAttachmentRemarkSection';
import {
	chatStreamFetch,
	fileToBase64Entry,
	REIMBURSEMENT_FORM_EXTRACT_MESSAGE,
	type AiReimbursementFormExtractPayload,
	type AiReimbursementFormExtractRow,
	type AiReimbursementFormField,
} from '../api/ai';
import dayjs from 'dayjs';

const { TextArea } = Input;

/** 部分系统/浏览器下 file.type 为空，用于预览弹窗正确识别图片/PDF */
function inferMimeFromFileName(fileName: string): string | undefined {
	const ext = fileName.split('.').pop()?.toLowerCase();
	if (!ext) return undefined;
	const map: Record<string, string> = {
		jpg: 'image/jpeg',
		jpeg: 'image/jpeg',
		png: 'image/png',
		gif: 'image/gif',
		webp: 'image/webp',
		bmp: 'image/bmp',
		svg: 'image/svg+xml',
		pdf: 'application/pdf',
	};
	return map[ext];
}

function normalizeFieldType(t: string): FieldType {
	const x = (t || 'text').toLowerCase();
	if (x === 'number' || x === 'select' || x === 'date' || x === 'textarea') return x;
	return 'text';
}

function normalizeOptions(raw: unknown): { label: string; value: string }[] {
	if (!Array.isArray(raw)) return [];
	return raw.map((o) => {
		if (o && typeof o === 'object' && 'label' in o && 'value' in o) {
			const r = o as { label: unknown; value: unknown };
			return { label: String(r.label), value: String(r.value) };
		}
		return { label: String(o), value: String(o) };
	});
}

function aiFieldsToTypeFields(fields: AiReimbursementFormField[]): TypeField[] {
	return [...fields]
		.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
		.map((f, index) => ({
			_id: `ai-${f.key}-${index}`,
			key: f.key,
			label: f.label,
			type: normalizeFieldType(f.type),
			required: Boolean(f.required),
			options: normalizeOptions(f.options),
			sort: typeof f.sort === 'number' ? f.sort : index,
			is_calculate: Boolean(f.is_calculate),
		}));
}

function buildFieldValuesFromAi(fields: AiReimbursementFormField[]): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const f of fields) {
		if (f.value === undefined || f.value === null || f.value === '') continue;
		const t = normalizeFieldType(f.type);
		if (t === 'number') {
			const n = Number(f.value);
			if (!Number.isNaN(n)) out[f.key] = n;
		} else if (t === 'date') {
			const d = dayjs(String(f.value));
			if (d.isValid()) out[f.key] = d;
		} else {
			out[f.key] = f.value;
		}
	}
	return out;
}

function serializeDetailRow(
	row: Record<string, unknown>,
	fieldsMeta: TypeField[],
): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const f of fieldsMeta) {
		const v = row[f.key];
		if (v === undefined || v === null || v === '') continue;
		if (f.type === 'date' && dayjs.isDayjs(v)) {
			const d = v as dayjs.Dayjs;
			out[f.key] = d.isValid() ? d.format('YYYY-MM-DD') : v;
		} else {
			out[f.key] = v;
		}
	}
	return out;
}

/** 仅保留识别类型已与系统类型名称完全一致的明细行，用于提交。 */
function collectMatchedSubmissionRows(
	lineItems: Record<string, unknown>[] | undefined,
	selectedFields: TypeField[],
	lineItemMeta: LineItemCardMeta[],
	fileSlotSummaries: FileSlotRecognitionSummary[],
	types: ReimbursementType[],
): { detail: Record<string, unknown>; categoryId: string; fileIndex: number }[] {
	const rows = Array.isArray(lineItems) ? lineItems : [];
	const out: { detail: Record<string, unknown>; categoryId: string; fileIndex: number }[] = [];
	for (let i = 0; i < rows.length; i++) {
		const meta = lineItemMeta[i];
		if (!meta) continue;
		const summary = fileSlotSummaries.find((s) => s.fileIndex === meta.fileIndex);
		if (!summary?.matched || !summary.label) continue;
		const cat = types.find((t) => t.label.trim() === summary.label.trim());
		if (!cat?._id) continue;
		const detail = serializeDetailRow(rows[i] ?? {}, selectedFields);
		out.push({ detail, categoryId: cat._id, fileIndex: meta.fileIndex });
	}
	return out;
}

function normalizeExtractGroups(
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

function debugLogExtractPayload(payload: AiReimbursementFormExtractPayload): void {
	const groups = normalizeExtractGroups(payload);
	console.groupCollapsed('[AI报销识别] payload结构预览');
	console.log('raw payload =>', payload);
	try {
		console.log('raw payload json =>', JSON.stringify(payload, null, 2));
	} catch (e) {
		console.warn('raw payload stringify failed =>', e);
	}
	console.log('groups.length =>', groups.length);
	console.log(
		'groups summary =>',
		groups.map((g, gi) => ({
			groupIndex: gi + 1,
			rowCount: g.length,
			rows: g.map((r, ri) => ({
				rowIndex: ri + 1,
				label: r?.label,
				is_suggested_type: r?.is_suggested_type,
				fill_error: r?.fill_error,
				fields_count: Array.isArray(r?.fields) ? r.fields.length : 0,
				field_keys: Array.isArray(r?.fields) ? r.fields.map((f) => f.key) : [],
			})),
		})),
	);
	console.groupEnd();
}

type LineItemCardMeta = { fileIndex: number; indexInFile: number };

type FileSlotRecognitionSummary = {
	fileIndex: number;
	label: string;
	rowCount: number;
	matched: boolean;
	isSuggested: boolean;
	over_limit_threshold?: number | null;
	fillError?: string;
};

function buildFileSlotSummaries(
	groups: AiReimbursementFormExtractRow[][],
	types: ReimbursementType[],
): FileSlotRecognitionSummary[] {
	return groups.map((g, fi) => {
		const rowsWithFields = g.filter((r) => (r.fields?.length ?? 0) > 0);
		const headRow = rowsWithFields[0] ?? g[0];
		const label = String(headRow?.label ?? '').trim();
		const rowCount = rowsWithFields.length;
		const fillError = g.find((r) => r.fill_error)?.fill_error;
		const isSuggested =
			rowsWithFields.some((r) => r.is_suggested_type === true) ||
			Boolean(headRow?.is_suggested_type);
		const matched = Boolean(label && types.some((t) => t.label.trim() === label));
		const over_limit_threshold =
			typeof headRow?.over_limit_threshold === 'number' ? headRow.over_limit_threshold : null;
		return {
			fileIndex: fi + 1,
			label,
			rowCount,
			matched,
			isSuggested,
			over_limit_threshold,
			fillError,
		};
	});
}

function FileSlotRecognitionBanner({ s }: { s: FileSlotRecognitionSummary }) {
	return (
		<div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-page)] px-3 py-2.5 text-sm text-[var(--text-primary)]">
			<span className="leading-relaxed">
				文件 {s.fileIndex}：
				{s.label || s.rowCount > 0 ? (
					<>
						识别类型：
						<span className="font-medium">{s.label || '—'}</span>
						{s.rowCount > 0 ? (
							<span className="text-[var(--text-secondary)]"> · 共 {s.rowCount} 条明细</span>
						) : null}
					</>
				) : (
					<span className="text-[var(--text-tertiary)]">未识别到有效明细</span>
				)}
				{s.fillError ? (
					<span className="text-orange-500 ml-1">（{s.fillError}）</span>
				) : null}
				{s.matched ? (
					<span className="text-green-500 ml-2">（已匹配系统类型）</span>
				) : s.isSuggested ? (
					<span className="text-amber-500 ml-2">
						（建议类型，需在后台创建并选择后方可提交）
					</span>
				) : s.label ? (
					<span className="text-amber-500 ml-2">（未匹配系统类型，将无法提交）</span>
				) : s.rowCount > 0 ? (
					<span className="text-amber-500 ml-2">（未识别到可提交的报销类型）</span>
				) : null}
			</span>
		</div>
	);
}

function LocalFileRow({
	file,
	blobUrl,
	onPreview,
	onRemove,
}: {
	file: UploadFile;
	blobUrl: string | null;
	onPreview: (url: string, mime?: string) => void;
	onRemove: () => void;
}) {
	const inferredMime = inferMimeFromFileName(file.name);
	const mime =
		(file.type && file.type !== '' ? file.type : undefined) ??
		(file.originFileObj?.type && file.originFileObj.type !== '' ? file.originFileObj.type : undefined) ??
		inferredMime;
	const isImg =
		(mime?.startsWith('image/') ?? false) ||
		(!mime && /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name));

	return (
		<div className="flex items-center gap-2 py-1.5 px-2 border border-[var(--border-color)] rounded-lg bg-[var(--bg-card)]">
			{isImg && blobUrl ? (
				<Image
					src={blobUrl}
					width={40}
					height={40}
					className="rounded object-cover shrink-0"
					preview={false}
				/>
			) : (
				<div className="w-10 h-10 flex items-center justify-center bg-red-50 rounded shrink-0 text-red-400 text-xs font-bold">
					PDF
				</div>
			)}
			<span className="text-xs text-[var(--text-secondary)] flex-1 truncate">{file.name}</span>
			<Button
				type="text"
				size="small"
				icon={<EyeOutlined />}
				onClick={() => {
					if (blobUrl) onPreview(blobUrl, mime);
				}}
			/>
			<Button type="text" size="small" danger onClick={onRemove}>
				删除
			</Button>
		</div>
	);
}

function DynamicField({
	field,
	listRowName,
	namePrefix,
}: {
	field: TypeField;
	listRowName?: number;
	namePrefix?: (string | number)[];
}) {
	if (!field || typeof field !== 'object' || !field.key) return null;

	const rules = field.required ? [{ required: true, message: `请填写${field.label}` }] : [];
	const fullRow = field.type === 'textarea';
	const name: (string | number)[] =
		namePrefix != null
			? [...namePrefix, field.key]
			: listRowName !== undefined
				? [listRowName, field.key]
				: ['fields', field.key];

	const safeOptions = Array.isArray(field.options)
		? field.options.filter((o) => o && typeof o === 'object' && 'label' in o && 'value' in o)
		: [];

	const control = (() => {
		switch (field.type) {
			case 'number':
				return (
					<InputNumber
						className="w-full"
						min={0}
						precision={2}
						placeholder={`请输入${field.label}`}
					/>
				);
			case 'select':
				return (
					<Select className="w-full" placeholder={`请选择${field.label}`} options={safeOptions} />
				);
			case 'date':
				return <DatePicker className="w-full" placeholder={`请选择${field.label}`} />;
			case 'textarea':
				return <TextArea rows={3} placeholder={`请输入${field.label}`} />;
			default:
				return <Input className="w-full" placeholder={`请输入${field.label}`} />;
		}
	})();

	return (
		<div className={fullRow ? 'md:col-span-2' : ''}>
			<Form.Item label={field.label} name={name} rules={rules}>
				{control}
			</Form.Item>
		</div>
	);
}

type FillMode = 'smart' | 'manual';

interface ManualItemMeta {
	selectedType: ReimbursementType | null;
	selectedFields: TypeField[];
	files: UploadFile[];
}

function createManualItemMeta(): ManualItemMeta {
	return { selectedType: null, selectedFields: [], files: [] };
}

/** 将智能识别得到的每条 lineItem 同步为手动表单中的一条报销项（类型、字段、对应文件）。 */
function buildManualSyncFromRecognition(
	types: ReimbursementType[],
	lineItems: Record<string, unknown>[],
	itemMeta: LineItemCardMeta[],
	summaries: FileSlotRecognitionSummary[],
	uploadFiles: UploadFile[],
	aiTemplateFields: TypeField[],
	remark?: string,
): { manualItems: { categoryId?: string; fields: Record<string, unknown>; remark: string }[]; metas: ManualItemMeta[] } {
	const sortedAi = [...aiTemplateFields].sort((a, b) => a.sort - b.sort);
	const manualItems: { categoryId?: string; fields: Record<string, unknown>; remark: string }[] = [];
	const metas: ManualItemMeta[] = [];

	for (let i = 0; i < lineItems.length; i++) {
		const m = itemMeta[i];
		const summary = m ? summaries.find((s) => s.fileIndex === m.fileIndex) : undefined;
		const cat =
			summary?.matched && summary.label
				? types.find((t) => t.label.trim() === summary.label.trim()) ?? null
				: null;
		const typeFields = cat ? [...cat.fields].sort((a, b) => a.sort - b.sort) : sortedAi;
		const fields: Record<string, unknown> = {};
		for (const f of typeFields) {
			const v = (lineItems[i] ?? {})[f.key];
			if (v !== undefined && v !== null && v !== '') fields[f.key] = v;
		}
		const slotFile = m && uploadFiles[m.fileIndex - 1] ? uploadFiles[m.fileIndex - 1] : undefined;
		const item: { categoryId: string; fields: Record<string, unknown>; remark: string } = {
			categoryId: cat?._id ?? '',
			fields,
			remark: i === 0 ? (remark ?? '') : '',
		};
		manualItems.push(item);
		metas.push({
			selectedType: cat,
			selectedFields: typeFields,
			files: slotFile ? [slotFile] : [],
		});
	}
	return { manualItems, metas };
}

export default function ReimbursementForm() {
	const [smartForm] = Form.useForm();
	const [manualForm] = Form.useForm();
	const [fillMode, setFillMode] = useState<FillMode>('smart');
	const [types, setTypes] = useState<ReimbursementType[]>([]);
	const [categoryLoading, setCategoryLoading] = useState(false);
	const [selectedFields, setSelectedFields] = useState<TypeField[]>([]);
	const [fileList, setFileList] = useState<UploadFile[]>([]);
	const [submitting, setSubmitting] = useState(false);
	const [extracting, setExtracting] = useState(false);
	const [dragOver, setDragOver] = useState(false);
	const [lineItemMeta, setLineItemMeta] = useState<LineItemCardMeta[]>([]);
	const [fileSlotSummaries, setFileSlotSummaries] = useState<FileSlotRecognitionSummary[]>([]);
	const [fileSlotFields, setFileSlotFields] = useState<Map<number, TypeField[]>>(new Map());
	const [extractIsSuggested, setExtractIsSuggested] = useState(false);
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);
	const [previewMime, setPreviewMime] = useState<string | undefined>(undefined);
	const [manualItemsMeta, setManualItemsMeta] = useState<ManualItemMeta[]>([createManualItemMeta()]);

	const fileInputRef = useRef<HTMLInputElement>(null);
	/** 智能填写左栏：与 fileList 同步的 blob 预览地址（渲染阶段维护，避免子组件 useEffect 首帧无 URL） */
	const smartFileBlobUrlRef = useRef<Map<string, string>>(new Map());
	const typesRef = useRef<ReimbursementType[]>([]);
	typesRef.current = types;
	const fileListRef = useRef<UploadFile[]>([]);
	fileListRef.current = fileList;
	const lineItemMetaRef = useRef<LineItemCardMeta[]>([]);
	lineItemMetaRef.current = lineItemMeta;
	const fileSlotSummariesRef = useRef<FileSlotRecognitionSummary[]>([]);
	fileSlotSummariesRef.current = fileSlotSummaries;
	const selectedFieldsRef = useRef<TypeField[]>([]);
	selectedFieldsRef.current = selectedFields;

	const openPreview = (url: string, mime?: string) => {
		setPreviewUrl(url);
		setPreviewMime(mime);
	};
	const user = useAuthStore((s) => s.user);

	const hasMatchedLineItemsToSubmit = useMemo(() => {
		if (lineItemMeta.length === 0 || selectedFields.length === 0) return false;
		for (let i = 0; i < lineItemMeta.length; i++) {
			const meta = lineItemMeta[i];
			const summary = fileSlotSummaries.find((s) => s.fileIndex === meta.fileIndex);
			if (!summary?.matched || !summary.label) continue;
			if (types.some((t) => t.label.trim() === summary.label.trim())) return true;
		}
		return false;
	}, [lineItemMeta, fileSlotSummaries, selectedFields.length, types]);

	const applyExtractResult = useCallback(
		(payload: AiReimbursementFormExtractPayload) => {
			const groups = normalizeExtractGroups(payload);
			const summaries = buildFileSlotSummaries(groups, typesRef.current);
			setFileSlotSummaries(summaries);

			for (const g of groups) {
				for (const r of g) {
					if (r.fill_error) message.warning(r.fill_error);
				}
			}

			const flat: {
				row: AiReimbursementFormExtractRow;
				fileIndex: number;
				indexInFile: number;
			}[] = [];
			groups.forEach((g, fi) => {
				let li = 0;
				for (const r of g) {
					if ((r.fields?.length ?? 0) > 0) {
						li += 1;
						flat.push({ row: r, fileIndex: fi + 1, indexInFile: li });
					}
				}
			});

			const allFlat = groups.flat();
			const head =
				flat[0]?.row ??
				allFlat.find((r) => (r.fields?.length ?? 0) > 0) ??
				allFlat[0];
			const label = ((head?.label ?? '') as string).trim();
			const dataRows = flat.map((x) => x.row);

			if (dataRows.length === 0) {
				setLineItemMeta([]);
				setSelectedFields([]);
				setExtractIsSuggested(false);
				smartForm.setFieldValue('lineItems', []);
				const matched = typesRef.current.find((t) => t.label.trim() === label) ?? null;
				if (label && !matched) {
					message.warning(
						`未在系统中找到与「${label}」完全一致的报销类型名称，提交前请确认已在后台配置该类型`,
					);
				}
				return;
			}

			const anySuggested = dataRows.some((r) => r.is_suggested_type === true);
			setExtractIsSuggested(anySuggested);
			if (anySuggested) {
				message.info(
					'票据未匹配到系统已有报销类型，已根据内容生成「建议类型」表单；提交前请在后台创建对应类型并在本页选择',
				);
			}

			const itemMetaLine = flat.map((x) => ({ fileIndex: x.fileIndex, indexInFile: x.indexInFile }));
			setLineItemMeta(itemMetaLine);

			// Build per-file field templates
			const perFileFields = new Map<number, TypeField[]>();
			let unionFields: TypeField[] = [];
			const unionKeys = new Set<string>();
			groups.forEach((g, fi) => {
				const fileIndex = fi + 1;
				const rowsWithFields = g.filter((r) => (r.fields?.length ?? 0) > 0);
				const headRow = rowsWithFields[0] ?? g[0];
				const sorted = [...(headRow?.fields ?? [])].sort(
					(a, b) => (a.sort ?? 0) - (b.sort ?? 0),
				);
				const typeFields = aiFieldsToTypeFields(sorted);
				perFileFields.set(fileIndex, typeFields);
				for (const tf of typeFields) {
					if (!unionKeys.has(tf.key)) {
						unionKeys.add(tf.key);
						unionFields.push(tf);
					}
				}
			});
			setFileSlotFields(perFileFields);
			setSelectedFields(unionFields);

			const matched = typesRef.current.find((t) => t.label.trim() === label) ?? null;
			if (label && !matched && !anySuggested) {
				message.warning(
					`未在系统中找到与「${label}」完全一致的报销类型名称，提交前请确认已在后台配置该类型`,
				);
			}

			const lineItems = dataRows.map((r) =>
				buildFieldValuesFromAi(
					[...(r.fields ?? [])].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)),
				),
			);
			smartForm.setFieldsValue({ lineItems });

			const remarkVal = smartForm.getFieldValue('remark') as string | undefined;
			const { manualItems, metas } = buildManualSyncFromRecognition(
				typesRef.current,
				lineItems,
				itemMetaLine,
				summaries,
				fileListRef.current,
				unionFields,
				remarkVal,
			);
			manualForm.setFieldsValue({
				applicant: smartForm.getFieldValue('applicant'),
				applyTime: smartForm.getFieldValue('applyTime') ?? dayjs(),
				manualItems,
			});
			setManualItemsMeta(metas);
		},
		[smartForm, manualForm],
	);

	const clearAiForm = useCallback(() => {
		setLineItemMeta([]);
		setFileSlotSummaries([]);
		setFileSlotFields(new Map());
		setExtractIsSuggested(false);
		setSelectedFields([]);
		smartForm.setFieldValue('lineItems', []);
	}, [smartForm]);

	useEffect(() => {
		setCategoryLoading(true);
		getReimbursementTypes()
			.then((data) => setTypes(data))
			.catch(() => {})
			.finally(() => setCategoryLoading(false));
	}, []);

	useEffect(() => {
		return () => {
			smartFileBlobUrlRef.current.forEach((u) => URL.revokeObjectURL(u));
			smartFileBlobUrlRef.current.clear();
		};
	}, []);

	useEffect(() => {
		if (user?.real_name) {
			smartForm.setFieldValue('applicant', user.real_name);
			manualForm.setFieldValue('applicant', user.real_name);
		}
		if (!smartForm.getFieldValue('applyTime')) {
			smartForm.setFieldValue('applyTime', dayjs());
		}
		if (!manualForm.getFieldValue('applyTime')) {
			manualForm.setFieldValue('applyTime', dayjs());
		}
	}, [user?.real_name, smartForm, manualForm]);

	const syncFormsOnModeChange = useCallback(
		(next: FillMode) => {
			if (next === 'manual') {
				const lineItems = smartForm.getFieldValue('lineItems') as Record<string, unknown>[] | undefined;
				const rows = Array.isArray(lineItems) ? lineItems : [];
				if (rows.length > 0) {
					const { manualItems, metas } = buildManualSyncFromRecognition(
						typesRef.current,
						rows,
						lineItemMetaRef.current,
						fileSlotSummariesRef.current,
						fileListRef.current,
						selectedFieldsRef.current,
						smartForm.getFieldValue('remark') as string | undefined,
					);
					manualForm.setFieldsValue({
						applicant: smartForm.getFieldValue('applicant'),
						applyTime: smartForm.getFieldValue('applyTime') ?? dayjs(),
						manualItems,
					});
					setManualItemsMeta(metas);
				} else {
					manualForm.setFieldsValue({
						applicant: smartForm.getFieldValue('applicant'),
						applyTime: smartForm.getFieldValue('applyTime') ?? dayjs(),
					});
				}
			}
			setFileList([]);
			clearAiForm();
			if (next === 'smart') {
				smartForm.setFieldsValue({
					applicant: manualForm.getFieldValue('applicant'),
					applyTime: manualForm.getFieldValue('applyTime') ?? dayjs(),
				});
			}
			setFillMode(next);
		},
		[smartForm, manualForm, clearAiForm],
	);

	// Clear AI results when all files are removed
	useEffect(() => {
		if (fillMode !== 'smart') return;
		if (fileList.length === 0) {
			clearAiForm();
		}
	}, [fillMode, fileList, clearAiForm]);

	// Manual recognition trigger
	const handleStartRecognition = useCallback(async () => {
		const files = fileList.map((f) => f.originFileObj).filter(Boolean) as File[];
		if (files.length === 0) return;

		setExtracting(true);
		try {
			const fileEntries = await Promise.all(files.map(fileToBase64Entry));
			const stream = chatStreamFetch({
				message: REIMBURSEMENT_FORM_EXTRACT_MESSAGE,
				files: fileEntries,
			});
			let got = false;
			for await (const chunk of stream) {
				if (
					chunk.done &&
					chunk.type === 'reimbursement_form_extract' &&
					chunk.data != null &&
					(typeof chunk.data === 'object' || Array.isArray(chunk.data))
				) {
					debugLogExtractPayload(chunk.data as AiReimbursementFormExtractPayload);
					applyExtractResult(chunk.data as AiReimbursementFormExtractPayload);
					got = true;
				}
			}
			if (!got) {
				message.error('未能获取智能填单结果，请重试或更换文件');
			}
		} catch {
			message.error('智能识别服务异常，请稍后再试');
		} finally {
			setExtracting(false);
		}
	}, [fileList, applyExtractResult]);

	const addLocalFiles = (files: FileList | File[]) => {
		const arr = Array.from(files).filter(Boolean);
		if (arr.length === 0) return;
		const next = arr.map((file, i) => ({
			uid: `${Date.now()}-${i}-${file.name}`,
			name: file.name,
			status: 'done' as const,
			originFileObj: file,
		})) as UploadFile[];
		setFileList((prev) => [...prev, ...next]);
		clearAiForm();
	};

	const addManualLocalFiles = (files: FileList | File[], itemIndex: number) => {
		const arr = Array.from(files).filter(Boolean);
		if (arr.length === 0) return;
		const next = arr.map((file, i) => ({
			uid: `m-${Date.now()}-${i}-${file.name}`,
			name: file.name,
			status: 'done' as const,
			originFileObj: file,
		})) as UploadFile[];
		setManualItemsMeta((prev) =>
			prev.map((item, idx) => (idx === itemIndex ? { ...item, files: [...item.files, ...next] } : item)),
		);
	};

	const onFinishManual = async (values: {
		applicant: string;
		applyTime: dayjs.Dayjs | string;
		manualItems?: {
			categoryId: string;
			fields?: Record<string, unknown>;
			remark?: string;
		}[];
	}) => {
		const manualItems = values.manualItems ?? [];
		if (manualItems.length === 0) {
			message.error('请至少添加一个报销项');
			return;
		}

		setSubmitting(true);
		try {
			const applyD = dayjs(values.applyTime);
			const applyDate = applyD.isValid()
				? applyD.format('YYYY-MM-DD')
				: dayjs().format('YYYY-MM-DD');

			const payload: {
				applicant_name: string;
				category: string;
				apply_date: string;
				attachments: string[];
				details: Record<string, unknown>[];
			}[] = [];

			message.loading({
				content: '正在上传附件...',
				key: 'uploading-manual',
				duration: 0,
			});

			for (let i = 0; i < manualItems.length; i++) {
				const item = manualItems[i];
				const meta = manualItemsMeta[i];
				const cat = types.find((t) => t._id === item.categoryId);
				if (!cat) {
					message.destroy('uploading-manual');
					message.error(`第 ${i + 1} 个报销项的报销类型无效`);
					return;
				}
				const fieldsMeta = [...cat.fields].sort((a, b) => a.sort - b.sort);
				if (fieldsMeta.length === 0) {
					message.destroy('uploading-manual');
					message.error(`第 ${i + 1} 个报销项未配置字段，无法提交`);
					return;
				}
				if (!meta || meta.files.length === 0) {
					message.destroy('uploading-manual');
					message.error(`第 ${i + 1} 个报销项请至少上传 1 个附件`);
					return;
				}
				const uploadedIds: string[] = [];
				for (const file of meta.files) {
					if (!file.originFileObj) continue;
					try {
						const res = await uploadFile(file.originFileObj, 'attachment');
						uploadedIds.push(res.id);
					} catch {
						message.destroy('uploading-manual');
						message.error(`第 ${i + 1} 个报销项文件 ${file.name} 上传失败`);
						return;
					}
				}
				const detail = serializeDetailRow(item.fields ?? {}, fieldsMeta);
				payload.push({
					applicant_name: values.applicant,
					category: cat._id,
					apply_date: applyDate,
					attachments: uploadedIds,
					details: [detail],
				});
			}
			message.destroy('uploading-manual');
			message.success('附件上传成功');

			await createReimbursement(payload);
			message.success(payload.length > 1 ? `成功提交 ${payload.length} 条报销申请` : '报销单提交成功');
			manualForm.resetFields();
			manualForm.setFieldsValue({
				applicant: user?.real_name ?? '',
				applyTime: dayjs(),
				manualItems: [{ categoryId: '', fields: {} }],
			});
			setManualItemsMeta([createManualItemMeta()]);
		} catch {
			// 错误已由拦截器统一提示
		} finally {
			setSubmitting(false);
		}
	};

	const onFinish = async (values: {
		applicant: string;
		applyTime: dayjs.Dayjs | string;
		lineItems?: Record<string, unknown>[];
		remark?: string;
	}) => {
		setSubmitting(true);
		try {
			const uploadedIds: string[] = [];
			if (fileList.length > 0) {
				message.loading({
					content: '正在上传附件...',
					key: 'uploading',
					duration: 0,
				});
				for (const file of fileList) {
					if (file.originFileObj) {
						try {
							const res = await uploadFile(file.originFileObj, 'attachment');
							uploadedIds.push(res.id);
						} catch {
							message.destroy('uploading');
							message.error(`文件 ${file.name} 上传失败`);
							setSubmitting(false);
							return;
						}
					}
				}
				message.destroy('uploading');
				message.success('附件上传成功');
			}

			const applyD = dayjs(values.applyTime);
			const applyDate = applyD.isValid()
				? applyD.format('YYYY-MM-DD')
				: dayjs().format('YYYY-MM-DD');

			const matchedRows = collectMatchedSubmissionRows(
				values.lineItems,
				selectedFields,
				lineItemMeta,
				fileSlotSummaries,
				types,
			);
			if (matchedRows.length === 0) {
				message.error(
					extractIsSuggested
						? '没有已匹配系统类型的明细可提交。建议类型需在后台创建且识别名称与系统一致后才会纳入提交。'
						: '没有已匹配系统类型的明细可提交。未匹配的文件不会被提交，请核对识别类型与后台配置的名称是否完全一致。',
				);
				return;
			}

			const payload = matchedRows.map(({ detail, categoryId, fileIndex }) => {
				const slotId =
					uploadedIds.length > 0 && fileIndex >= 1
						? uploadedIds[fileIndex - 1]
						: undefined;
				return {
					applicant_name: values.applicant,
					category: categoryId,
					apply_date: applyDate,
					attachments: slotId != null && slotId !== '' ? [slotId] : [],
					details: [detail],
				};
			});

			const res = (await createReimbursement(payload)) as CreateReimbursementResult;
			const n = res?.count ?? matchedRows.length;
			const skipped = lineItemMeta.length - matchedRows.length;
			if (skipped > 0) {
				message.success(
					n > 1
						? `成功提交 ${n} 条报销申请（另有 ${skipped} 条因类型未匹配系统而未提交）`
						: `报销单提交成功（另有 ${skipped} 条因类型未匹配系统而未提交）`,
				);
			} else {
				message.success(n > 1 ? `成功提交 ${n} 条报销申请` : '报销单提交成功');
			}
			smartForm.resetFields();
			smartForm.setFieldsValue({
				applicant: user?.real_name ?? '',
				applyTime: dayjs(),
			});
			setSelectedFields([]);
			setFileList([]);
			setLineItemMeta([]);
			setFileSlotSummaries([]);
			setExtractIsSuggested(false);
		} catch {
			// 错误已由拦截器统一提示
		} finally {
			setSubmitting(false);
		}
	};

	const getSmartSummaryOverLimit = (summary: FileSlotRecognitionSummary): number | null => {
		const matchedType = types.find((t) => t.label.trim() === summary.label.trim());
		return matchedType?.over_limit_threshold ?? summary.over_limit_threshold ?? null;
	};

	{
		const alive = new Set<string>();
		for (const f of fileList) {
			alive.add(f.uid);
			const obj = f.originFileObj;
			if (obj && !smartFileBlobUrlRef.current.has(f.uid)) {
				smartFileBlobUrlRef.current.set(f.uid, URL.createObjectURL(obj));
			}
		}
		for (const uid of [...smartFileBlobUrlRef.current.keys()]) {
			if (!alive.has(uid)) {
				const url = smartFileBlobUrlRef.current.get(uid);
				if (url) URL.revokeObjectURL(url);
				smartFileBlobUrlRef.current.delete(uid);
			}
		}
	}

	return (
		<Card className="w-full flex flex-col flex-1">
			<div className="mb-5 w-full">
				<Segmented<FillMode>
					block
					className="w-full"
					options={[
						{ label: '智能识别填写', value: 'smart' },
						{ label: '手动填写', value: 'manual' },
					]}
					value={fillMode}
					onChange={(v) => syncFormsOnModeChange(v as FillMode)}
				/>
			</div>
			<div className="flex items-center justify-center gap-2.5 mb-5">
				<div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--color-primary-bg)]">
					<InboxOutlined className="text-[var(--color-primary)] text-sm" />
				</div>
				<h2 className="text-base md:text-lg font-semibold text-[var(--text-primary)]">
					填写报销申请单
				</h2>
			</div>

			{fillMode === 'smart' ? (
			<div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-[420px]">
				<div className="lg:w-[min(100%,380px)] shrink-0 flex flex-col gap-3">
					<input
						ref={fileInputRef}
						type="file"
						className="hidden"
						accept="image/*,.pdf"
						multiple
						onChange={(e) => {
							if (e.target.files?.length) addLocalFiles(e.target.files);
							e.target.value = '';
						}}
					/>
					<div
						role="button"
						tabIndex={0}
						onKeyDown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
						}}
						onClick={() => fileInputRef.current?.click()}
						onDragOver={(e) => {
							e.preventDefault();
							e.stopPropagation();
							setDragOver(true);
						}}
						onDragLeave={(e) => {
							e.preventDefault();
							e.stopPropagation();
							setDragOver(false);
						}}
						onDrop={(e) => {
							e.preventDefault();
							e.stopPropagation();
							setDragOver(false);
							if (e.dataTransfer.files?.length) addLocalFiles(e.dataTransfer.files);
						}}
						className={[
							'flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-10 cursor-pointer transition-colors select-none min-h-[200px]',
							dragOver
								? 'border-[var(--color-primary)] bg-[var(--color-primary-bg)]'
								: 'border-[var(--border-color-hover)] bg-[var(--bg-page)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-bg)]',
						].join(' ')}
					>
						<InboxOutlined className="text-4xl text-[var(--color-primary)] mb-2" />
						<p className="text-sm font-medium text-[var(--text-primary)] text-center">拖拽发票或凭证到此处</p>
						<p className="text-xs text-[var(--text-secondary)] mt-1 text-center">
							或点击选择文件（支持图片、PDF，可多选）
						</p>
					</div>

					{fileList.length > 0 && (
						<div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
							{fileList.map((file) => (
								<LocalFileRow
									key={file.uid}
									file={file}
									blobUrl={smartFileBlobUrlRef.current.get(file.uid) ?? null}
									onPreview={openPreview}
									onRemove={() => {
										setFileList((prev) => {
											const next = prev.filter((f) => f.uid !== file.uid);
											if (next.length === 0) clearAiForm();
											return next;
										});
									}}
								/>
							))}
						</div>
					)}

					{fileList.length > 0 && (
						<Button
							type="primary"
							block
							loading={extracting}
							disabled={extracting}
							onClick={handleStartRecognition}
						>
							{extracting ? '识别中...' : '开始识别'}
						</Button>
					)}
				</div>

				<div className="flex-1 min-w-0 flex flex-col">
					<Spin spinning={extracting} tip="正在识别报销类型并提取字段...">
						<Form
							form={smartForm}
							layout="vertical"
							onFinish={onFinish}
							size="middle"
							className="min-h-[200px]"
						>
							<div className="grid grid-cols-1 md:grid-cols-2 gap-x-5">
								<Form.Item
									label="申请人"
									name="applicant"
									rules={[{ required: true, message: '请输入申请人姓名' }]}
								>
									<Input placeholder="请输入姓名" />
								</Form.Item>

								<Form.Item
									label="申请时间"
									name="applyTime"
									rules={[{ required: true, message: '请选择申请时间' }]}
								>
									<DatePicker
										className="w-full"
										placeholder="请选择日期"
										disabledDate={(d) => d.isAfter(dayjs(), 'day')}
									/>
								</Form.Item>
							</div>

							<div className="mb-3 text-sm text-[var(--text-secondary)] min-h-[22px]">
								{categoryLoading ? (
									<span>正在加载报销类型配置…</span>
								) : fileList.length === 0 ? (
									<span className="text-[var(--text-tertiary)]">
										上传文件后点击「开始识别」按钮
									</span>
								) : extracting ? (
									<span>正在识别票据…</span>
								) : fileSlotSummaries.length === 0 ? (
									<span className="text-[var(--text-tertiary)]">点击左侧「开始识别」按钮开始识别</span>
								) : (
									<span>
										各文件的识别状态与明细见下方分区（按上传顺序）
									</span>
								)}
							</div>

							{fileList.length > 0 &&
								!extracting &&
								fileSlotSummaries.length > 0 &&
								fileSlotFields.size > 0 && (
									<Form.List name="lineItems">
										{(fields) => (
											<div className="space-y-10">
												{fileSlotSummaries.map((s) => {
													const fieldEntries = fields.filter(
														({ name }) =>
															lineItemMeta[Number(name)]?.fileIndex === s.fileIndex,
													);
													return (
														<section
															key={s.fileIndex}
															className="space-y-4 pb-2 border-b border-[var(--border-color)] last:border-b-0 last:pb-0"
														>
															<FileSlotRecognitionBanner s={s} />
															{getSmartSummaryOverLimit(s) != null && (
																<div className="-mt-1">
																	<span className="text-xs text-orange-500">
																		报销上限金额为 {getSmartSummaryOverLimit(s)} 元，超出属于超额报销
																	</span>
																</div>
															)}
															<div className="space-y-4">
																{fieldEntries.map(({ key, name }) => {
																	const idx = Number(name);
																	const meta = lineItemMeta[idx];
																	const title = meta
																		? `明细 ${meta.indexInFile}`
																		: `明细 ${idx + 1}`;
																	return (
																		<Card
																			key={key}
																			size="small"
																			title={title}
																			className="border-gray-200"
																		>
																			<div className="grid grid-cols-1 md:grid-cols-2 gap-x-5">
																				{(fileSlotFields.get(s.fileIndex) ?? selectedFields).map((field, fIdx) => (
																					<DynamicField
																						key={`${String(name)}-${field._id ?? fIdx}`}
																						field={field}
																						listRowName={name}
																					/>
																				))}
																			</div>
																		</Card>
																	);
																})}
															</div>
														</section>
													);
												})}
											</div>
										)}
									</Form.List>
								)}

							{fileList.length > 0 &&
								!extracting &&
								fileSlotSummaries.length > 0 &&
								fileSlotFields.size === 0 && (
									<div className="space-y-10">
										{fileSlotSummaries.map((s) => (
											<section
												key={s.fileIndex}
												className="space-y-3 pb-2 border-b border-[var(--border-color)] last:border-b-0 last:pb-0"
											>
												<FileSlotRecognitionBanner s={s} />
												{getSmartSummaryOverLimit(s) != null && (
													<div className="-mt-1">
														<span className="text-xs text-orange-500">
															报销上限金额为 {getSmartSummaryOverLimit(s)} 元，超出属于超额报销
														</span>
													</div>
												)}
												<p className="text-sm text-[var(--text-tertiary)] pl-0.5">
													该文件未识别到可填写的动态字段，请尝试更清晰的票据或联系管理员。
												</p>
											</section>
										))}
									</div>
								)}

							{fileList.length > 0 &&
								!extracting &&
								fileSlotSummaries.length === 0 &&
								selectedFields.length === 0 && (
									<p className="text-sm text-[var(--text-tertiary)] py-4">
										未识别到动态字段，请尝试更清晰的票据或联系管理员。
									</p>
								)}

							<Form.Item label="备注" name="remark">
								<TextArea rows={3} placeholder="其他补充说明（选填）" />
							</Form.Item>

							<Form.Item className="mt-2 mb-0">
								<Button
									type="primary"
									htmlType="submit"
									size="large"
									className="w-full"
									loading={submitting}
									disabled={fileList.length === 0 || !hasMatchedLineItemsToSubmit}
								>
									提交报销申请
								</Button>
							</Form.Item>
						</Form>
					</Spin>
				</div>
			</div>
			) : (
				<Form
					form={manualForm}
					layout="vertical"
					onFinish={onFinishManual}
					size="middle"
					className="min-h-[200px] w-full flex flex-col flex-1"
					initialValues={{ manualItems: [{ categoryId: '', fields: {} }] }}
				>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-x-5">
						<Form.Item
							label="申请人"
							name="applicant"
							rules={[{ required: true, message: '请输入申请人姓名' }]}
						>
							<Input placeholder="请输入姓名" />
						</Form.Item>

						<Form.Item
							label="申请时间"
							name="applyTime"
							rules={[{ required: true, message: '请选择申请时间' }]}
						>
							<DatePicker
								className="w-full"
								placeholder="请选择日期"
								disabledDate={(d) => d.isAfter(dayjs(), 'day')}
							/>
						</Form.Item>
					</div>
					<Form.List name="manualItems">
						{(fields, { add, remove }) => (
							<>
								{fields.map(({ key, name }, idx) => (
									<ReimbursementTypeAttachmentRemarkSection
										key={key}
										itemIndex={idx}
										formItemName={name}
										types={types}
										categoryLoading={categoryLoading}
										selectedType={manualItemsMeta[idx]?.selectedType ?? null}
										files={manualItemsMeta[idx]?.files ?? []}
										onCategoryChange={(id) => {
											const t = types.find((x) => x._id === id) ?? null;
											const sorted = t ? [...t.fields].sort((a, b) => a.sort - b.sort) : [];
											setManualItemsMeta((prev) =>
												prev.map((item, i) =>
													i === idx ? { ...item, selectedType: t, selectedFields: sorted } : item,
												),
											);
											manualForm.setFieldValue(['manualItems', name, 'fields'], {});
										}}
										onFilesAdd={(files) => addManualLocalFiles(files, idx)}
										onFileRemove={(uid) => {
											setManualItemsMeta((prev) =>
												prev.map((item, i) =>
													i === idx
														? { ...item, files: item.files.filter((f) => f.uid !== uid) }
														: item,
												),
											);
										}}
										onPreview={openPreview}
										onRemoveItem={
											fields.length > 1
												? () => {
														remove(name);
														setManualItemsMeta((prev) => prev.filter((_, i) => i !== idx));
													}
												: undefined
										}
									>
										{(manualItemsMeta[idx]?.selectedFields ?? []).length > 0 ? (
											<div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 mb-2">
												{(manualItemsMeta[idx]?.selectedFields ?? []).map((field, fIdx) => (
													<DynamicField
														key={`${String(name)}-${field._id ?? fIdx}`}
														field={field}
														namePrefix={[name, 'fields']}
													/>
												))}
											</div>
										) : (
											<p className="text-sm text-[var(--text-tertiary)] mb-4">
												{categoryLoading ? '正在加载报销类型配置…' : '请先选择报销类型，将显示对应填报字段。'}
											</p>
										)}
									</ReimbursementTypeAttachmentRemarkSection>
								))}
								<Button
									type="dashed"
									className="w-full mb-4"
									onClick={() => {
										add({ categoryId: '', fields: {} });
										setManualItemsMeta((prev) => [...prev, createManualItemMeta()]);
									}}
								>
									新增一个报销项
								</Button>
							</>
						)}
					</Form.List>

					<Form.Item className="mt-2 mb-0">
						<Button
							type="primary"
							htmlType="submit"
							size="large"
							className="w-full"
							loading={submitting}
							disabled={categoryLoading}
						>
							提交报销申请
						</Button>
					</Form.Item>
				</Form>
			)}

			<FilePreviewModal
				url={previewUrl}
				mimeType={previewMime}
				onClose={() => {
					setPreviewUrl(null);
					setPreviewMime(undefined);
				}}
			/>
		</Card>
	);
}

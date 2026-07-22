import type { FileSlotRecognitionSummary } from './reimbursementRecognition';

export type FileRecogUiStatus =
	| 'pending'
	| 'extracting'
	| 'completed'
	| 'matched'
	| 'unmatched'
	| 'duplicate';

export const FILE_RECOG_STATUS_LABEL: Record<FileRecogUiStatus, string> = {
	pending: '待识别',
	extracting: '识别中',
	completed: '已完成',
	matched: '已识别',
	unmatched: '待选类型',
	duplicate: '重复',
};

/**
 * 解析左侧文件行识别徽章状态。
 * 识别进行中：按 progress 的 completedIndexes 实时标记已完成文件；
 * 识别结束后：按 summaries 展示匹配/待选/重复。
 */
export function resolveFileRecogUiStatus(
	fileIndex1Based: number,
	extracting: boolean,
	summaries: FileSlotRecognitionSummary[],
	completedIndexes: ReadonlySet<number> = new Set(),
): FileRecogUiStatus {
	if (extracting) {
		return completedIndexes.has(fileIndex1Based) ? 'completed' : 'extracting';
	}
	const s = summaries.find((x) => x.fileIndex === fileIndex1Based);
	if (!s) return 'pending';
	if (s.invoiceDuplicate || s.invoiceBatchDuplicate) return 'duplicate';
	if (s.matched || s.userSelectedCategoryId) return 'matched';
	return 'unmatched';
}

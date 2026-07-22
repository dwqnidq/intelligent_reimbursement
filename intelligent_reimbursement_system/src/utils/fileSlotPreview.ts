/**
 * 按识别结果卡的 fileIndex（1-based）解析本地预览 blob URL。
 * 预览只依赖上传文件，与是否识别出动态字段无关。
 */
export function resolveFileSlotBlobUrl(
	fileList: ReadonlyArray<{ uid: string }>,
	fileIndex1Based: number,
	blobUrlByUid: ReadonlyMap<string, string>,
): string | null {
	if (!Number.isFinite(fileIndex1Based) || fileIndex1Based < 1) return null;
	const file = fileList[fileIndex1Based - 1];
	if (!file) return null;
	return blobUrlByUid.get(file.uid) ?? null;
}

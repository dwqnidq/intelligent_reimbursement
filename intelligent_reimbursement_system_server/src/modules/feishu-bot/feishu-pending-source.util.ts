/** 尚未产出识别结果的源文件（按 file_key 判断；zip 内多文件共享同一 file_key） */
export function listPendingSourceFiles<
  TSource extends { file_key: string; kind: string },
  TRecognized extends { file_key?: string },
>(sourceFiles: TSource[], recognizedItems: TRecognized[]): TSource[] {
  const recognizedKeys = new Set(
    recognizedItems
      .map((item) => item.file_key)
      .filter((key): key is string => Boolean(key)),
  );

  return sourceFiles.filter((source) => {
    if (source.kind === 'folder') return false;
    return !recognizedKeys.has(source.file_key);
  });
}

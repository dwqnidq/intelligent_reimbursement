/**
 * 修复 multipart 上传时 Multer/Busboy 将 UTF-8 文件名误按 latin1 解析导致的乱码。
 * 已是正确中文的文件名不会被改写。
 */
export function decodeUploadedFilename(filename: string): string {
  if (!filename || !/[^\x00-\x7F]/.test(filename)) {
    return filename;
  }

  if (/[\u4e00-\u9fff]/.test(filename)) {
    return filename;
  }

  const decoded = Buffer.from(filename, 'latin1').toString('utf8');
  if (decoded.includes('\uFFFD')) {
    return filename;
  }

  if (/[\u4e00-\u9fff]/.test(decoded)) {
    return decoded;
  }

  return filename;
}

/** 判断文件名是否可能为 latin1 误解析的乱码，且可安全修复 */
export function isGarbledUploadedFilename(filename: string): boolean {
  if (!filename || /[\u4e00-\u9fff]/.test(filename)) {
    return false;
  }

  const decoded = decodeUploadedFilename(filename);
  return decoded !== filename;
}

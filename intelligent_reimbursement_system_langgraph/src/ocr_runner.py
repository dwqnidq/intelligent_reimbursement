"""PaddleOCR 单文件识别（每进程内单例，供主进程串行或 worker 进程使用）。"""
from __future__ import annotations

import base64
import logging
import mimetypes as _mimetypes
import tempfile
from typing import List, Optional

from src.ocr_image_prep import (
    OCR_FAST_MAX_SIDE,
    OCR_RETRY_MAX_SIDE,
    needs_ocr_retry,
    scale_image_bytes,
)

_logger = logging.getLogger(__name__)

_ocr_instance = None
_ocr_api_version: Optional[str] = None


def _get_ocr():
    global _ocr_instance, _ocr_api_version
    if _ocr_instance is None:
        import os

        os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")
        from paddleocr import PaddleOCR
        import paddleocr

        ver = getattr(paddleocr, "__version__", "0")
        major = int(ver.split(".")[0]) if ver else 0
        if major >= 3:
            _ocr_instance = PaddleOCR(
                lang="ch",
                use_doc_orientation_classify=False,
                use_doc_unwarping=False,
                use_textline_orientation=False,
            )
            _ocr_api_version = "v3"
        else:
            _ocr_instance = PaddleOCR(lang="ch", show_log=False, use_angle_cls=False)
            _ocr_api_version = "v2"
        _logger.info(
            "[OCR] PaddleOCR 实例已初始化 (API %s, version %s)",
            _ocr_api_version,
            ver,
        )
    return _ocr_instance


def _extract_text_lines(result) -> List[str]:
    if not result:
        return []
    first = result[0]
    if isinstance(first, dict) and "rec_texts" in first:
        return [text for text in first.get("rec_texts", []) if text]
    lines: List[str] = []
    if first:
        for line in first:
            if line and len(line) >= 2:
                text, _ = line[1]
                lines.append(text)
    return lines


def _run_ocr_on_image(ocr, image_path: str) -> List[str]:
    if _ocr_api_version == "v3":
        return _extract_text_lines(ocr.predict(image_path))
    return _extract_text_lines(ocr.ocr(image_path, cls=False))


def _ocr_prepared_image_bytes(ocr, image_bytes: bytes, suffix: str) -> str:
    tmp_path = None
    try:
        tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
        tmp.write(image_bytes)
        tmp.close()
        tmp_path = tmp.name
        lines = _run_ocr_on_image(ocr, tmp_path)
        return "\n".join(lines) if lines else ""
    finally:
        if tmp_path:
            try:
                import os

                os.unlink(tmp_path)
            except OSError:
                pass


def _ocr_image_bytes_fast_then_retry(ocr, file_bytes: bytes, file_name: str) -> str:
    prepared = scale_image_bytes(file_bytes, OCR_FAST_MAX_SIDE)
    text = _ocr_prepared_image_bytes(ocr, prepared.data, prepared.suffix)
    original_long = max(prepared.original_width, prepared.original_height)
    if not needs_ocr_retry(
        text,
        original_long_side=original_long,
        used_max_side=OCR_FAST_MAX_SIDE,
    ):
        return text

    _logger.info(
        "[OCR] 文件 %s 首轮文字过短(%d)，回退长边 %d 重试",
        file_name,
        len(text.strip()),
        OCR_RETRY_MAX_SIDE,
    )
    retry = scale_image_bytes(file_bytes, OCR_RETRY_MAX_SIDE)
    retry_text = _ocr_prepared_image_bytes(ocr, retry.data, retry.suffix)
    if len(retry_text.strip()) >= len(text.strip()):
        return retry_text
    return text


def reset_ocr_instance() -> None:
    global _ocr_instance, _ocr_api_version
    _ocr_instance = None
    _ocr_api_version = None


def warmup_ocr() -> None:
    """预热当前进程内的 PaddleOCR。"""
    try:
        _get_ocr()
    except Exception as e:
        _logger.warning("[OCR] 预热失败: %s", e)
        raise


def ocr_single_file(file_data: str) -> str:
    """对单个 `文件名::base64` 执行 OCR。PDF 逐页转图片后识别。"""
    if "::" in file_data:
        file_name, b64_content = file_data.split("::", 1)
    else:
        file_name, b64_content = file_data, None

    if not b64_content:
        _logger.warning("[OCR] 文件 %s 无 base64 内容，跳过", file_name)
        return ""

    mime, _ = _mimetypes.guess_type(file_name)
    is_pdf = mime == "application/pdf" if mime else file_name.lower().endswith(".pdf")

    try:
        file_bytes = base64.b64decode(b64_content)
        _logger.info(
            "[OCR] 文件 %s base64 解码成功，字节数: %d",
            file_name,
            len(file_bytes),
        )
    except Exception as e:
        _logger.error("[OCR] 文件 %s base64 解码失败: %s", file_name, e)
        return ""

    ocr = _get_ocr()

    if is_pdf:
        try:
            import fitz

            doc = fitz.open(stream=file_bytes, filetype="pdf")
            all_lines = []
            for page_idx in range(len(doc)):
                page = doc[page_idx]
                pix = page.get_pixmap(dpi=150)
                img_bytes = pix.tobytes("png")
                page_text = _ocr_image_bytes_fast_then_retry(
                    ocr,
                    img_bytes,
                    f"{file_name}#p{page_idx + 1}",
                )
                if page_text:
                    all_lines.append(page_text)
            total_pages = len(doc)
            doc.close()
            joined = "\n".join(all_lines)
            _logger.info(
                "[OCR] PDF %s 共 %d 页，提取文字长度: %d",
                file_name,
                total_pages,
                len(joined),
            )
            return joined
        except Exception as e:
            _logger.error("[OCR] PDF %s 处理异常: %s", file_name, e, exc_info=True)
            reset_ocr_instance()
            return ""

    try:
        text = _ocr_image_bytes_fast_then_retry(ocr, file_bytes, file_name)
        if not text.strip():
            _logger.warning("[OCR] 文件 %s 识别结果为空", file_name)
            return ""
        return text
    except Exception as e:
        _logger.error("[OCR] 文件 %s 识别异常: %s", file_name, e, exc_info=True)
        reset_ocr_instance()
        return ""

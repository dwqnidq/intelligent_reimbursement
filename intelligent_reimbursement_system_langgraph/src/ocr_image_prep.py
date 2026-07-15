"""OCR 前图片预处理：大图长边缩放，尽量少损精度地加速识别。"""
from __future__ import annotations

import io
import logging
from typing import NamedTuple

_logger = logging.getLogger(__name__)

# 首轮识别长边上限（发票场景 1800～2000 通常足够）
OCR_FAST_MAX_SIDE = 1800
# 首轮结果过短时回退长边
OCR_RETRY_MAX_SIDE = 2800
# 低于该字符数视为可疑，触发更高分辨率重试
OCR_MIN_TEXT_CHARS_FOR_ACCEPT = 24


class PreparedImage(NamedTuple):
    data: bytes
    suffix: str
    width: int
    height: int
    scaled: bool
    original_width: int
    original_height: int


def _load_rgb_image(file_bytes: bytes):
    from PIL import Image

    img = Image.open(io.BytesIO(file_bytes))
    img.load()
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    elif img.mode == "L":
        img = img.convert("RGB")
    return img


def scale_image_bytes(
    file_bytes: bytes,
    max_side: int,
    *,
    jpeg_quality: int = 90,
) -> PreparedImage:
    """按长边上限等比缩小；不超过则仍导出 JPEG（便于 OCR 临时文件）。"""
    if max_side <= 0:
        raise ValueError("max_side must be positive")

    img = _load_rgb_image(file_bytes)
    width, height = img.size
    long_side = max(width, height)

    if long_side <= max_side:
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=jpeg_quality, optimize=True)
        return PreparedImage(
            data=buf.getvalue(),
            suffix=".jpg",
            width=width,
            height=height,
            scaled=False,
            original_width=width,
            original_height=height,
        )

    scale = max_side / float(long_side)
    new_w = max(1, int(round(width * scale)))
    new_h = max(1, int(round(height * scale)))
    resized = img.resize((new_w, new_h), resample=_lanczos())
    buf = io.BytesIO()
    resized.save(buf, format="JPEG", quality=jpeg_quality, optimize=True)
    _logger.info(
        "[OCR prep] 缩放 %dx%d -> %dx%d (max_side=%d)",
        width,
        height,
        new_w,
        new_h,
        max_side,
    )
    return PreparedImage(
        data=buf.getvalue(),
        suffix=".jpg",
        width=new_w,
        height=new_h,
        scaled=True,
        original_width=width,
        original_height=height,
    )


def _lanczos():
    from PIL import Image

    return getattr(Image, "Resampling", Image).LANCZOS


def needs_ocr_retry(text: str, *, original_long_side: int, used_max_side: int) -> bool:
    """首轮过短且原图显著大于本轮上限时，建议用更高分辨率重试。"""
    if original_long_side <= used_max_side:
        return False
    if used_max_side >= OCR_RETRY_MAX_SIDE:
        return False
    return len((text or "").strip()) < OCR_MIN_TEXT_CHARS_FOR_ACCEPT

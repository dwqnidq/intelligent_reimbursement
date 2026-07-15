"""OCR 图片预处理单测"""
import io

from PIL import Image

from src.ocr_image_prep import (
    OCR_FAST_MAX_SIDE,
    OCR_MIN_TEXT_CHARS_FOR_ACCEPT,
    OCR_RETRY_MAX_SIDE,
    needs_ocr_retry,
    scale_image_bytes,
)


def _png_bytes(width: int, height: int) -> bytes:
    img = Image.new("RGB", (width, height), color=(240, 240, 240))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_scale_down_when_long_side_exceeds_limit():
    raw = _png_bytes(3072, 4096)
    prepared = scale_image_bytes(raw, OCR_FAST_MAX_SIDE)
    assert prepared.scaled is True
    assert max(prepared.width, prepared.height) == OCR_FAST_MAX_SIDE
    assert prepared.suffix == ".jpg"
    assert len(prepared.data) < len(raw)


def test_no_upscale_when_already_small():
    raw = _png_bytes(800, 600)
    prepared = scale_image_bytes(raw, OCR_FAST_MAX_SIDE)
    assert prepared.scaled is False
    assert prepared.width == 800
    assert prepared.height == 600


def test_needs_ocr_retry_when_text_short_and_image_was_downscaled():
    assert needs_ocr_retry(
        "短",
        original_long_side=4096,
        used_max_side=OCR_FAST_MAX_SIDE,
    )
    assert not needs_ocr_retry(
        "x" * OCR_MIN_TEXT_CHARS_FOR_ACCEPT,
        original_long_side=4096,
        used_max_side=OCR_FAST_MAX_SIDE,
    )
    assert not needs_ocr_retry(
        "",
        original_long_side=1000,
        used_max_side=OCR_FAST_MAX_SIDE,
    )
    assert not needs_ocr_retry(
        "短",
        original_long_side=4096,
        used_max_side=OCR_RETRY_MAX_SIDE,
    )

"""OCR 并行配置单测"""
from src.ocr_pool import (
    DEFAULT_OCR_MAX_PARALLEL,
    OCR_MAX_PARALLEL_CAP,
    resolve_ocr_max_parallel,
)


def test_resolve_default(monkeypatch):
    monkeypatch.delenv("OCR_MAX_PARALLEL", raising=False)
    assert resolve_ocr_max_parallel() == DEFAULT_OCR_MAX_PARALLEL


def test_resolve_cap(monkeypatch):
    monkeypatch.setenv("OCR_MAX_PARALLEL", "99")
    assert resolve_ocr_max_parallel() == OCR_MAX_PARALLEL_CAP


def test_resolve_serial(monkeypatch):
    monkeypatch.setenv("OCR_MAX_PARALLEL", "1")
    assert resolve_ocr_max_parallel() == 1


def test_resolve_invalid(monkeypatch):
    monkeypatch.setenv("OCR_MAX_PARALLEL", "abc")
    assert resolve_ocr_max_parallel() == DEFAULT_OCR_MAX_PARALLEL

"""OCR 并行配置与进程池自愈单测"""
from concurrent.futures.process import BrokenProcessPool
from unittest.mock import MagicMock

import src.ocr_pool as ocr_pool
from src.ocr_pool import (
    DEFAULT_OCR_MAX_PARALLEL,
    OCR_MAX_PARALLEL_CAP,
    ocr_files,
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


def _reset_pool_globals():
    ocr_pool._shutdown_pool()
    ocr_pool._pool = None
    ocr_pool._pool_workers = 0


def test_ocr_files_rebuilds_pool_after_broken(monkeypatch):
    """BrokenProcessPool 后应销毁并重建进程池，重试成功则返回结果。"""
    monkeypatch.setenv("OCR_MAX_PARALLEL", "2")
    _reset_pool_globals()

    broken_pool = MagicMock()
    broken_pool.map.side_effect = BrokenProcessPool("dead")
    healthy_pool = MagicMock()
    healthy_pool.map.return_value = iter(["text-a", "text-b"])
    pools = [broken_pool, healthy_pool]
    monkeypatch.setattr(ocr_pool, "get_ocr_pool", lambda: pools.pop(0))

    import src.ocr_runner as ocr_runner

    monkeypatch.setattr(
        ocr_runner,
        "ocr_single_file",
        lambda _f: (_ for _ in ()).throw(AssertionError("不应回退串行")),
    )

    result = ocr_files(["a::YQ==", "b::Yg=="])
    assert result == ["text-a", "text-b"]
    assert broken_pool.map.call_count == 1
    assert healthy_pool.map.call_count == 1
    assert pools == []


def test_ocr_files_falls_back_to_serial_when_rebuild_fails(monkeypatch):
    """重建后仍 BrokenProcessPool 时回退主进程串行 OCR。"""
    monkeypatch.setenv("OCR_MAX_PARALLEL", "2")
    _reset_pool_globals()

    dead_pool = MagicMock()
    dead_pool.map.side_effect = BrokenProcessPool("still dead")
    monkeypatch.setattr(ocr_pool, "get_ocr_pool", lambda: dead_pool)

    import src.ocr_runner as ocr_runner

    calls = []

    def fake_serial(file_data: str) -> str:
        calls.append(file_data)
        return f"serial:{file_data.split('::', 1)[0]}"

    monkeypatch.setattr(ocr_runner, "ocr_single_file", fake_serial)

    result = ocr_files(["f1::YQ==", "f2::Yg=="])
    assert result == ["serial:f1", "serial:f2"]
    assert calls == ["f1::YQ==", "f2::Yg=="]
    assert dead_pool.map.call_count == 2
    assert ocr_pool._pool is None

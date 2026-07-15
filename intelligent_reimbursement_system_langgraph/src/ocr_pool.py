"""OCR 多进程池：每进程独立 PaddleOCR，避免同实例多线程。"""
from __future__ import annotations

import atexit
import logging
import os
from concurrent.futures import ProcessPoolExecutor
from typing import List, Optional

_logger = logging.getLogger(__name__)

DEFAULT_OCR_MAX_PARALLEL = 2
OCR_MAX_PARALLEL_CAP = 3

_pool: Optional[ProcessPoolExecutor] = None
_pool_workers: int = 0
_atexit_registered = False


def resolve_ocr_max_parallel() -> int:
    """并行进程数：默认 2，上限 3；设为 1 则主进程串行。"""
    raw = os.environ.get("OCR_MAX_PARALLEL", str(DEFAULT_OCR_MAX_PARALLEL))
    try:
        value = int(raw)
    except ValueError:
        value = DEFAULT_OCR_MAX_PARALLEL
    return max(1, min(value, OCR_MAX_PARALLEL_CAP))


def _worker_init() -> None:
    from src.ocr_runner import warmup_ocr

    warmup_ocr()


def _worker_ocr(file_data: str) -> str:
    from src.ocr_runner import ocr_single_file

    return ocr_single_file(file_data)


def _worker_ping() -> str:
    """供预热：触发 worker 进程创建与 initializer。"""
    return "ok"


def _shutdown_pool() -> None:
    global _pool, _pool_workers
    if _pool is None:
        return
    try:
        _pool.shutdown(wait=False, cancel_futures=True)
    except TypeError:
        _pool.shutdown(wait=False)
    except Exception as e:
        _logger.warning("[OCR pool] shutdown 失败: %s", e)
    _pool = None
    _pool_workers = 0


def get_ocr_pool() -> ProcessPoolExecutor:
    """懒加载常驻进程池（worker 数随配置固定）。"""
    global _pool, _pool_workers, _atexit_registered
    workers = resolve_ocr_max_parallel()
    if workers <= 1:
        raise RuntimeError("OCR_MAX_PARALLEL<=1 时不应创建进程池")
    if _pool is not None and _pool_workers == workers:
        return _pool
    if _pool is not None:
        _shutdown_pool()
    _pool = ProcessPoolExecutor(
        max_workers=workers,
        initializer=_worker_init,
    )
    _pool_workers = workers
    if not _atexit_registered:
        atexit.register(_shutdown_pool)
        _atexit_registered = True
    _logger.info("[OCR pool] 已创建进程池 workers=%d", workers)
    return _pool


def prewarm_ocr_pool() -> None:
    """启动时预热：并行>1 时拉起 worker；否则只预热主进程 OCR。"""
    workers = resolve_ocr_max_parallel()
    if workers <= 1:
        from src.ocr_runner import warmup_ocr

        warmup_ocr()
        _logger.info("[OCR pool] 串行模式，已预热主进程 OCR")
        return

    pool = get_ocr_pool()
    for fut in [pool.submit(_worker_ping) for _ in range(workers)]:
        fut.result(timeout=600)
    _logger.info("[OCR pool] 已预热 %d 个 OCR worker", workers)


def ocr_files(files: List[str]) -> List[str]:
    """按输入顺序 OCR；多文件且并行>1 时走进程池。"""
    if not files:
        return []

    from src.ocr_runner import ocr_single_file

    workers = resolve_ocr_max_parallel()
    if len(files) == 1 or workers <= 1:
        return [ocr_single_file(f) for f in files]

    pool = get_ocr_pool()
    _logger.info(
        "[OCR pool] 并行识别 files=%d workers=%d",
        len(files),
        workers,
    )
    return list(pool.map(_worker_ocr, files))

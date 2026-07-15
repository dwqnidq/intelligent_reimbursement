"""gRPC 消息大小配置（独立于 Graph / LLM，便于单测）"""
from __future__ import annotations

import os

_DEFAULT_MAX_MESSAGE_LENGTH = 100 * 1024 * 1024
_MIN_MAX_MESSAGE_LENGTH = 4 * 1024 * 1024


def grpc_message_length() -> int:
    """单条 gRPC 消息上下限（字节），默认 100MB，避免发票 base64 超默认 4MB"""
    raw = os.environ.get(
        "GRPC_MAX_MESSAGE_LENGTH",
        str(_DEFAULT_MAX_MESSAGE_LENGTH),
    )
    try:
        value = int(raw)
    except ValueError:
        value = _DEFAULT_MAX_MESSAGE_LENGTH
    return max(value, _MIN_MAX_MESSAGE_LENGTH)


def grpc_server_options() -> list[tuple[str, int]]:
    max_msg = grpc_message_length()
    return [
        ("grpc.max_send_message_length", max_msg),
        ("grpc.max_receive_message_length", max_msg),
    ]

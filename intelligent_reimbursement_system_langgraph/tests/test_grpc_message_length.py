"""gRPC 消息大小配置单测"""
from src.grpc_service.message_size import grpc_message_length, grpc_server_options


def test_grpc_message_length_default(monkeypatch):
    monkeypatch.delenv("GRPC_MAX_MESSAGE_LENGTH", raising=False)
    assert grpc_message_length() == 100 * 1024 * 1024


def test_grpc_message_length_from_env(monkeypatch):
    monkeypatch.setenv("GRPC_MAX_MESSAGE_LENGTH", "20971520")
    assert grpc_message_length() == 20971520


def test_grpc_message_length_invalid_falls_back(monkeypatch):
    monkeypatch.setenv("GRPC_MAX_MESSAGE_LENGTH", "not-a-number")
    assert grpc_message_length() == 100 * 1024 * 1024


def test_grpc_message_length_floor_at_4mb(monkeypatch):
    monkeypatch.setenv("GRPC_MAX_MESSAGE_LENGTH", "1024")
    assert grpc_message_length() == 4 * 1024 * 1024


def test_grpc_server_options_include_send_and_receive(monkeypatch):
    monkeypatch.setenv("GRPC_MAX_MESSAGE_LENGTH", "20971520")
    opts = dict(grpc_server_options())
    assert opts["grpc.max_send_message_length"] == 20971520
    assert opts["grpc.max_receive_message_length"] == 20971520

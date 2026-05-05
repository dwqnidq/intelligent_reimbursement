"""项目配置 - 直接从 .env 文件读取，自带类型校验"""
import os
from pathlib import Path
from typing import List, Tuple

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """所有配置项从 .env 自动读取，无需手动 load_dotenv / os.getenv"""

    model_config = SettingsConfigDict(
        env_file=str(Path(__file__).resolve().parents[2] / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # 豆包大模型配置
    ARK_API_KEY: str = ""
    ARK_BASE_URL: str = "https://ark.cn-beijing.volces.com/api/v3"
    DOUBAO_MODEL: str = "doubao-seed-2-0-pro-260215"

    # 服务器配置
    SERVER_HOST: str = "0.0.0.0"
    SERVER_PORT: int = 50051
    MAX_WORKERS: int = 10

    # 日志配置
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"

    # MongoDB
    MONGODB_URI: str = ""
    MONGODB_DB_NAME: str = ""

    # gRPC
    GRPC_MAX_MESSAGE_LENGTH: int = 100 * 1024 * 1024

    @property
    def GRPC_OPTIONS(self) -> List[Tuple[str, int]]:
        return [
            ("grpc.max_send_message_length", self.GRPC_MAX_MESSAGE_LENGTH),
            ("grpc.max_receive_message_length", self.GRPC_MAX_MESSAGE_LENGTH),
        ]


settings = Settings()

# 项目路径常量（非环境变量，直接计算）
BASE_DIR = Path(__file__).resolve().parents[2]
SRC_DIR = BASE_DIR / "src"
PROTO_DIR = BASE_DIR / "proto"
GENERATED_DIR = Path(__file__).resolve().parent / "generated"

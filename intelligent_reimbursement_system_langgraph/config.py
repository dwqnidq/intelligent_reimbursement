"""项目配置文件"""
import os
from dotenv import load_dotenv

# 加载 .env 文件
load_dotenv()

# 项目路径
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SRC_DIR = os.path.join(BASE_DIR, "src")
PROTO_DIR = os.path.join(BASE_DIR, "proto")
GENERATED_DIR = os.path.join(SRC_DIR, "generated")

# 豆包大模型配置
ARK_API_KEY = os.getenv("ARK_API_KEY", "")
ARK_BASE_URL = os.getenv("ARK_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3")
DOUBAO_MODEL = os.getenv("DOUBAO_MODEL", "doubao-seed2.0-mini")

# 服务器配置
SERVER_HOST = os.getenv("SERVER_HOST", "0.0.0.0")
SERVER_PORT = int(os.getenv("SERVER_PORT", "50051"))
MAX_WORKERS = int(os.getenv("MAX_WORKERS", "10"))

# 日志配置
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
LOG_FORMAT = os.getenv("LOG_FORMAT", "%(asctime)s - %(name)s - %(levelname)s - %(message)s")

# gRPC 配置
GRPC_MAX_MESSAGE_LENGTH = int(os.getenv("GRPC_MAX_MESSAGE_LENGTH", str(100 * 1024 * 1024)))
GRPC_OPTIONS = [
    ('grpc.max_send_message_length', GRPC_MAX_MESSAGE_LENGTH),
    ('grpc.max_receive_message_length', GRPC_MAX_MESSAGE_LENGTH),
]

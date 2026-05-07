"""主入口文件 - 一键启动服务器"""
import sys
import os
import argparse
import logging

from dotenv import load_dotenv
load_dotenv()

from src.grpc_service.server import serve

# 配置日志
logging.basicConfig(
    level=getattr(logging, os.environ.get("LOG_LEVEL", "INFO")),
    format=os.environ.get("LOG_FORMAT", "%(asctime)s - %(name)s - %(levelname)s - %(message)s")
)
logger = logging.getLogger(__name__)


def main():
    """主函数"""
    default_port = int(os.environ.get("SERVER_PORT", "50051"))
    default_host = os.environ.get("SERVER_HOST", "0.0.0.0")

    parser = argparse.ArgumentParser(description='LangGraph gRPC 服务器')
    parser.add_argument(
        '--port',
        type=int,
        default=default_port,
        help=f'服务器端口 (默认: {default_port})'
    )
    parser.add_argument(
        '--host',
        type=str,
        default=default_host,
        help=f'服务器地址 (默认: {default_host})'
    )

    args = parser.parse_args()

    logger.info("=" * 50)
    logger.info("LangGraph gRPC 服务器启动中...")
    logger.info("监听地址: %s:%s", args.host, args.port)
    logger.info("=" * 50)

    try:
        serve(port=args.port, host=args.host)
    except KeyboardInterrupt:
        logger.info("服务器已停止")
    except Exception as e:
        logger.error("服务器错误: %s", e, exc_info=True)
        sys.exit(1)


if __name__ == '__main__':
    main()

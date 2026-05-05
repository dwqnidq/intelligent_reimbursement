"""主入口文件 - 一键启动服务器"""
import sys
import argparse
import logging

from reimbursement_langgraph.config import settings
from reimbursement_langgraph.grpc_service.server import serve

# 配置日志
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format=settings.LOG_FORMAT
)
logger = logging.getLogger(__name__)


def main():
    """主函数"""
    parser = argparse.ArgumentParser(description='LangGraph gRPC 服务器')
    parser.add_argument(
        '--port',
        type=int,
        default=settings.SERVER_PORT,
        help=f'服务器端口 (默认: {settings.SERVER_PORT})'
    )
    parser.add_argument(
        '--host',
        type=str,
        default=settings.SERVER_HOST,
        help=f'服务器地址 (默认: {settings.SERVER_HOST})'
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

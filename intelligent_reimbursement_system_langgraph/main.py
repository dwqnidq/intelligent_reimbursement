"""主入口文件 - 一键启动服务器"""
import sys
import os
import argparse
import logging

# 添加项目路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from config import SERVER_PORT, SERVER_HOST, LOG_LEVEL, LOG_FORMAT
from grpc_service.server import serve

# 配置日志
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL),
    format=LOG_FORMAT
)
logger = logging.getLogger(__name__)


def main():
    """主函数"""
    parser = argparse.ArgumentParser(description='LangGraph gRPC 服务器')
    parser.add_argument(
        '--port',
        type=int,
        default=SERVER_PORT,
        help=f'服务器端口 (默认: {SERVER_PORT})'
    )
    parser.add_argument(
        '--host',
        type=str,
        default=SERVER_HOST,
        help=f'服务器地址 (默认: {SERVER_HOST})'
    )
    
    args = parser.parse_args()
    
    logger.info("=" * 50)
    logger.info("LangGraph gRPC 服务器启动中...")
    logger.info(f"监听地址: {args.host}:{args.port}")
    logger.info("=" * 50)
    
    try:
        serve(port=args.port, host=args.host)
    except KeyboardInterrupt:
        logger.info("\n服务器已停止")
    except Exception as e:
        logger.error(f"服务器错误: {e}", exc_info=True)
        sys.exit(1)


if __name__ == '__main__':
    main()

"""客户端入口文件 - 一键测试客户端"""
import sys
import os
import argparse

# 添加项目路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from config import SERVER_PORT, SERVER_HOST
from grpc_service.client import run_sync_client, run_stream_client


def main():
    """主函数"""
    parser = argparse.ArgumentParser(description='LangGraph gRPC 客户端测试')
    parser.add_argument(
        '--port',
        type=int,
        default=SERVER_PORT,
        help=f'服务器端口 (默认: {SERVER_PORT})'
    )
    parser.add_argument(
        '--host',
        type=str,
        default='localhost',
        help='服务器地址 (默认: localhost)'
    )
    parser.add_argument(
        '--input',
        type=str,
        default='测试输入数据',
        help='输入文本 (默认: 测试输入数据)'
    )
    parser.add_argument(
        '--mode',
        type=str,
        choices=['sync', 'stream', 'both'],
        default='both',
        help='调用模式: sync(同步), stream(流式), both(两者) (默认: both)'
    )
    
    args = parser.parse_args()
    
    print("=" * 50)
    print("LangGraph gRPC 客户端测试")
    print(f"连接地址: {args.host}:{args.port}")
    print(f"输入内容: {args.input}")
    print("=" * 50)
    
    try:
        if args.mode in ['sync', 'both']:
            print("\n=== 同步调用 ===")
            run_sync_client(args.input, args.host, args.port)
        
        if args.mode in ['stream', 'both']:
            print("\n=== 流式调用 ===")
            run_stream_client(args.input, args.host, args.port)
            
        print("\n测试完成！")
        
    except Exception as e:
        print(f"\n错误: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()

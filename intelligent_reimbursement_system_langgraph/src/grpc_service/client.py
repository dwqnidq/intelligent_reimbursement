"""gRPC 客户端示例"""
import grpc
import logging
import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..'))

from generated import graph_service_pb2, graph_service_pb2_grpc
from config import SERVER_PORT

logger = logging.getLogger(__name__)


def run_sync_client(input_text: str, host: str = 'localhost', port: int = SERVER_PORT) -> None:
    """同步调用示例"""
    with grpc.insecure_channel(f'{host}:{port}') as channel:
        stub = graph_service_pb2_grpc.GraphServiceStub(channel)
        
        request = graph_service_pb2.GraphRequest(
            input=input_text,
            config={"mode": "sync"}
        )
        
        print(f"发送请求: {input_text}")
        response = stub.ExecuteGraph(request)
        
        if response.success:
            print(f"执行成功!")
            print(f"输出: {response.output}")
            print(f"元数据: {dict(response.metadata)}")
        else:
            print(f"执行失败: {response.error}")
        
        return response


def run_stream_client(input_text: str, host: str = 'localhost', port: int = SERVER_PORT) -> None:
    """流式调用示例"""
    with grpc.insecure_channel(f'{host}:{port}') as channel:
        stub = graph_service_pb2_grpc.GraphServiceStub(channel)
        
        request = graph_service_pb2.GraphRequest(
            input=input_text,
            config={"mode": "stream"}
        )
        
        print(f"发送流式请求: {input_text}")
        print("接收流式响应:")
        
        for response in stub.StreamExecuteGraph(request):
            print(f"  节点: {response.node_name}")
            print(f"  输出: {response.output}")
            print(f"  是否最终: {response.is_final}")
            print("---")


if __name__ == '__main__':
    # 同步调用示例
    print("=== 同步调用 ===")
    run_sync_client("测试输入数据")
    
    print("\n=== 流式调用 ===")
    run_stream_client("测试流式数据")

"""gRPC 客户端示例"""
import grpc
import logging

from reimbursement_langgraph.generated import graph_service_pb2, graph_service_pb2_grpc
from reimbursement_langgraph.config import settings

logger = logging.getLogger(__name__)


def run_sync_client(input_text: str, host: str = 'localhost', port: int = settings.SERVER_PORT) -> None:
    """同步调用示例"""
    with grpc.insecure_channel(f'{host}:{port}') as channel:
        stub = graph_service_pb2_grpc.GraphServiceStub(channel)

        request = graph_service_pb2.GraphRequest(
            input=input_text,
            config={"mode": "sync"}
        )

        logger.info("发送请求: %s", input_text)
        response = stub.ExecuteGraph(request)

        if response.success:
            logger.info("执行成功!")
            logger.info("输出: %s", response.output)
            logger.info("元数据: %s", dict(response.metadata))
        else:
            logger.error("执行失败: %s", response.error)

        return response


def run_stream_client(input_text: str, host: str = 'localhost', port: int = settings.SERVER_PORT) -> None:
    """流式调用示例"""
    with grpc.insecure_channel(f'{host}:{port}') as channel:
        stub = graph_service_pb2_grpc.GraphServiceStub(channel)

        request = graph_service_pb2.GraphRequest(
            input=input_text,
            config={"mode": "stream"}
        )

        logger.info("发送流式请求: %s", input_text)
        logger.info("接收流式响应:")

        for response in stub.StreamExecuteGraph(request):
            logger.info("  节点: %s", response.node)
            logger.info("  输出: %s", response.output)
            logger.info("  是否最终: %s", response.is_final)
            logger.info("---")


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    # 同步调用示例
    print("=== 同步调用 ===")
    run_sync_client("测试输入数据")

    print("\n=== 流式调用 ===")
    run_stream_client("测试流式数据")

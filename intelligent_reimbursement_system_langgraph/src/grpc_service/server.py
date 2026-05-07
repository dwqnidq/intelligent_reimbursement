"""gRPC 服务器实现"""
import os
import grpc
import logging
from concurrent import futures

from src.generated import graph_service_pb2, graph_service_pb2_grpc
from src.graph import main_graph
from src.stream import stream_graph

logger = logging.getLogger(__name__)


class GraphServiceServicer(graph_service_pb2_grpc.GraphServiceServicer):
    """GraphService 实现"""

    def ExecuteGraph(self, request, context):
        """执行图的同步方法"""
        try:
            logger.info("收到请求: %s", request.input)

            # 准备初始状态
            files = list(request.files) if hasattr(request, 'files') and request.files else []
            initial_state = {
                "input": request.input,
                "messages": [],
                "output": "",
                "step_count": 0,
                "files": files,
                "intent": "",
                "node": "",
                "result": None,
            }

            # 执行图
            result = main_graph.invoke(initial_state)

            # 构建响应
            response = graph_service_pb2.GraphResponse(
                output=result.get("output", ""),
                success=True,
                error="",
            )

            # 添加元数据
            response.metadata["step_count"] = str(result.get("step_count", 0))
            response.metadata["message_count"] = str(len(result.get("messages", [])))
            response.metadata["node"] = result.get("node", "unknown")

            logger.info("返回响应: node=%s", result.get("node"))
            return response

        except Exception as e:
            logger.exception("执行错误: %s", e)
            return graph_service_pb2.GraphResponse(
                output="",
                success=False,
                error=str(e)
            )

    def StreamExecuteGraph(self, request, context):
        """流式执行图，逐 token 推送"""
        try:
            files = list(request.files) if hasattr(request, 'files') and request.files else []
            logger.info(
                "收到流式请求 input 前缀=%s | files 数量=%d",
                (request.input or "")[:80],
                len(files),
            )
            config = dict(request.config) if hasattr(request, 'config') and request.config else {}
            is_admin = config.get('is_admin', 'false').lower() == 'true'

            for chunk in stream_graph(request.input, files, is_admin=is_admin):
                yield graph_service_pb2.GraphStreamResponse(
                    node=chunk.get("node", ""),
                    token=chunk.get("token", ""),
                    output=chunk.get("output", ""),
                    is_final=chunk.get("is_final", False),
                    success=chunk.get("success", True),
                    error=chunk.get("error", ""),
                )
        except Exception as e:
            logger.exception("流式执行错误: %s", e)
            yield graph_service_pb2.GraphStreamResponse(
                node="error",
                token="",
                output="",
                is_final=True,
                success=False,
                error=str(e),
            )
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(str(e))


def serve(port: int | None = None, host: str | None = None) -> None:
    """启动 gRPC 服务器"""
    if port is None:
        port = int(os.environ.get("SERVER_PORT", "50051"))
    if host is None:
        host = os.environ.get("SERVER_HOST", "0.0.0.0")

    max_workers = int(os.environ.get("MAX_WORKERS", "10"))
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=max_workers))
    graph_service_pb2_grpc.add_GraphServiceServicer_to_server(
        GraphServiceServicer(), server
    )

    server.add_insecure_port(f'{host}:{port}')
    server.start()

    logger.info("gRPC 服务器已启动，监听 %s:%s", host, port)
    server.wait_for_termination()


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    serve()

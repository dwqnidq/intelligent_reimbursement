FROM python:3.11-slim

WORKDIR /app

# 安装系统依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# 先复制依赖文件，利用 Docker 层缓存
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制项目文件
COPY . .

# 生成 gRPC 代码
RUN python -m grpc_tools.protoc \
    -I./proto \
    --python_out=./src/generated \
    --grpc_python_out=./src/generated \
    ./proto/graph_service.proto && \
    python -c "\
import re; \
f=open('src/generated/graph_service_pb2_grpc.py','r',encoding='utf-8'); \
content=f.read(); f.close(); \
content=re.sub(r'^import graph_service_pb2 as','from . import graph_service_pb2 as',content,flags=re.MULTILINE); \
f=open('src/generated/graph_service_pb2_grpc.py','w',encoding='utf-8'); \
f.write(content); f.close()"

EXPOSE 50051

CMD ["python", "main.py"]

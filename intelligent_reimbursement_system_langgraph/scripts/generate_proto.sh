#!/bin/bash

# 生成 gRPC 代码脚本（需在项目根目录 intelligent_reimbursement_system_langgraph 下执行）
cd "$(dirname "$0")/.."

mkdir -p src/generated

python -m grpc_tools.protoc \
    -I./proto \
    --python_out=./src/generated \
    --grpc_python_out=./src/generated \
    ./proto/graph_service.proto

python -c "
import re
path = 'src/generated/graph_service_pb2_grpc.py'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()
content = re.sub(
    r'^import graph_service_pb2 as',
    'from . import graph_service_pb2 as',
    content,
    flags=re.MULTILINE,
)
with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print('导入路径已修复')
"

touch src/generated/__init__.py

echo "gRPC 代码生成完成！"

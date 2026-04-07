#!/bin/bash

# 生成 gRPC 代码脚本

# 创建生成代码目录
mkdir -p src/generated

# 生成 Python gRPC 代码
python -m grpc_tools.protoc \
    -I./proto \
    --python_out=./src/generated \
    --grpc_python_out=./src/generated \
    ./proto/graph_service.proto

# 修复导入路径
python -c "
import re
with open('src/generated/graph_service_pb2_grpc.py', 'r', encoding='utf-8') as f:
    content = f.read()
content = re.sub(r'^import graph_service_pb2 as', 'from . import graph_service_pb2 as', content, flags=re.MULTILINE)
with open('src/generated/graph_service_pb2_grpc.py', 'w', encoding='utf-8') as f:
    f.write(content)
print('导入路径已修复')
"

# 创建 __init__.py
touch src/generated/__init__.py

echo "gRPC 代码生成完成！"

@echo off
REM 生成 gRPC 代码脚本 (Windows)
REM 需要在项目根目录 intelligent_reimbursement_system_langgraph 下执行

REM 创建生成代码目录
if not exist src\generated mkdir src\generated

REM 生成 Python gRPC 代码
python -m grpc_tools.protoc ^
    -I./proto ^
    --python_out=./src/generated ^
    --grpc_python_out=./src/generated ^
    ./proto/graph_service.proto

REM 修复导入路径
python -c "import re; f=open('src/generated/graph_service_pb2_grpc.py','r',encoding='utf-8'); content=f.read(); f.close(); content=re.sub(r'^import graph_service_pb2 as', 'from . import graph_service_pb2 as', content, flags=re.MULTILINE); f=open('src/generated/graph_service_pb2_grpc.py','w',encoding='utf-8'); f.write(content); f.close(); print('导入路径已修复')"

REM 创建 __init__.py
type nul > src\generated\__init__.py

echo gRPC 代码生成完成！
pause

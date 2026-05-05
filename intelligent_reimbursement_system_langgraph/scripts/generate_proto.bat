@echo off
REM 生成 gRPC 代码脚本 (Windows)
REM 需要在项目根目录 intelligent_reimbursement_system_langgraph 下执行

REM 创建生成代码目录
if not exist src\reimbursement_langgraph\generated mkdir src\reimbursement_langgraph\generated

REM 生成 Python gRPC 代码
python -m grpc_tools.protoc ^
    -I./proto ^
    --python_out=./src/reimbursement_langgraph/generated ^
    --grpc_python_out=./src/reimbursement_langgraph/generated ^
    ./proto/graph_service.proto

REM 修复导入路径
python -c "import re; f=open('src/reimbursement_langgraph/generated/graph_service_pb2_grpc.py','r',encoding='utf-8'); content=f.read(); f.close(); content=re.sub(r'^import graph_service_pb2 as', 'from . import graph_service_pb2 as', content, flags=re.MULTILINE); f=open('src/reimbursement_langgraph/generated/graph_service_pb2_grpc.py','w',encoding='utf-8'); f.write(content); f.close(); print('导入路径已修复')"

REM 创建 __init__.py
type nul > src\reimbursement_langgraph\generated\__init__.py

echo gRPC 代码生成完成！
pause

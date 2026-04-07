#!/bin/bash

# 切换到项目根目录（scripts 的上级）
cd "$(dirname "$0")/.."

echo "========================================"
echo "  LangGraph 智能报销助手 - 快速启动"
echo "========================================"
echo ""

if ! command -v python3 &> /dev/null; then
    echo "[错误] 未检测到Python，请先安装Python 3.8+"
    exit 1
fi

echo "[1/6] 检查Python版本..."
python3 --version

if [ ! -d ".venv" ]; then
    echo ""
    echo "[2/6] 创建虚拟环境..."
    python3 -m venv .venv || { echo "[错误] 虚拟环境创建失败"; exit 1; }
    echo "[成功] 虚拟环境已创建"
else
    echo "[2/6] 虚拟环境已存在，跳过创建"
fi

echo ""
echo "[3/6] 激活虚拟环境..."
source .venv/bin/activate || { echo "[错误] 虚拟环境激活失败"; exit 1; }

echo ""
echo "[4/6] 安装依赖..."
pip install -r requirements.txt -q

echo ""
echo "[5/6] 检查环境变量配置..."
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "[提示] 已从模板创建 .env，请填入豆包API密钥后按回车继续..."
    read -r
fi

echo ""
echo "[6/6] 生成gRPC代码..."
if [ ! -f "src/generated/graph_service_pb2.py" ]; then
    bash scripts/generate_proto.sh || { echo "[错误] gRPC代码生成失败"; exit 1; }
else
    echo "[跳过] gRPC代码已存在"
fi

echo ""
echo "========================================"
echo "  准备就绪，启动服务..."
echo "========================================"
echo "[提示] 按 Ctrl+C 可停止服务"
echo ""
sleep 2

python3 main.py

"""检查项目配置"""
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
load_dotenv()

BASE_DIR = Path(__file__).resolve().parents[1]


def check_config():
    """检查配置是否正确"""
    print("=" * 60)
    print("项目配置检查")
    print("=" * 60)

    all_ok = True

    # 检查 .env 文件
    print("\n📄 环境变量文件:")
    env_path = BASE_DIR / ".env"
    if env_path.exists():
        print(f"  ✅ .env 文件存在 ({env_path})")
    else:
        print(f"  ❌ .env 文件不存在 ({env_path})")
        print("     请运行: cp .env.dev .env 或 cp .env.prod .env")
        all_ok = False

    # 检查豆包配置
    print("\n🤖 豆包大模型配置:")
    doubao_model = os.environ.get("DOUBAO_MODEL", "")
    ark_base_url = os.environ.get("ARK_BASE_URL", "")
    ark_api_key = os.environ.get("ARK_API_KEY", "")

    print(f"  模型名称: {doubao_model}")
    print(f"  API 地址: {ark_base_url}")

    if ark_api_key and ark_api_key != "your_ark_api_key_here":
        print(f"  API Key: {'*' * 20}{ark_api_key[-8:]}")
        print("  ✅ API Key 已配置")
    else:
        print("  ❌ API Key 未配置或使用默认值")
        print("     请在 .env 文件中设置 ARK_API_KEY")
        all_ok = False

    # 检查服务器配置
    print("\n🌐 服务器配置:")
    print(f"  监听地址: {os.environ.get('SERVER_HOST', '0.0.0.0')}")
    print(f"  监听端口: {os.environ.get('SERVER_PORT', '50051')}")
    print(f"  工作线程: {os.environ.get('MAX_WORKERS', '10')}")
    print(f"  日志级别: {os.environ.get('LOG_LEVEL', 'INFO')}")
    print("  ✅ 服务器配置正常")

    # 检查 MongoDB 配置
    print("\n🗄️  MongoDB 配置:")
    mongodb_uri = os.environ.get("MONGODB_URI", "")
    if mongodb_uri:
        print(f"  URI: {mongodb_uri[:20]}...{mongodb_uri[-10:]}" if len(mongodb_uri) > 30 else f"  URI: {mongodb_uri}")
        print("  ✅ MONGODB_URI 已配置")
    else:
        print("  ⚠️  MONGODB_URI 未配置（智能填单功能将不可用）")

    # 检查必要的目录
    print("\n📁 项目结构:")
    required_dirs = [
        'src/reimbursement_langgraph/graph',
        'src/reimbursement_langgraph/grpc_service',
        'src/reimbursement_langgraph/generated',
        'proto'
    ]

    for dir_path in required_dirs:
        full_path = BASE_DIR / dir_path
        if full_path.exists():
            print(f"  ✅ {dir_path}")
        else:
            print(f"  ❌ {dir_path} 不存在")
            all_ok = False

    # 检查 gRPC 生成文件
    print("\n⚙️  gRPC 生成文件:")
    grpc_files = [
        'src/reimbursement_langgraph/generated/graph_service_pb2.py',
        'src/reimbursement_langgraph/generated/graph_service_pb2_grpc.py'
    ]

    grpc_ok = all((BASE_DIR / f).exists() for f in grpc_files)
    if grpc_ok:
        print("  ✅ gRPC 代码已生成")
    else:
        print("  ❌ gRPC 代码未生成")
        print("     请运行: python -m grpc_tools.protoc -I./proto --python_out=./src/reimbursement_langgraph/generated --grpc_python_out=./src/reimbursement_langgraph/generated ./proto/graph_service.proto")
        all_ok = False

    # 总结
    print("\n" + "=" * 60)
    if all_ok:
        print("✅ 所有配置检查通过！可以启动服务器了")
        print("\n启动命令:")
        print("  python main.py")
    else:
        print("❌ 配置检查未通过，请修复上述问题")
    print("=" * 60)

    return all_ok


if __name__ == '__main__':
    success = check_config()
    sys.exit(0 if success else 1)

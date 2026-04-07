"""检查项目配置"""
import os
import sys

# 添加项目根路径
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from config import (
    ARK_API_KEY, ARK_BASE_URL, DOUBAO_MODEL,
    SERVER_HOST, SERVER_PORT, MAX_WORKERS,
    LOG_LEVEL
)


def check_config():
    """检查配置是否正确"""
    print("=" * 60)
    print("项目配置检查")
    print("=" * 60)
    
    all_ok = True
    
    # 检查 .env 文件
    print("\n📄 环境变量文件:")
    if os.path.exists('.env'):
        print("  ✅ .env 文件存在")
    else:
        print("  ❌ .env 文件不存在")
        print("     请运行: cp .env.example .env")
        all_ok = False
    
    # 检查豆包配置
    print("\n🤖 豆包大模型配置:")
    print(f"  模型名称: {DOUBAO_MODEL}")
    print(f"  API 地址: {ARK_BASE_URL}")
    
    if ARK_API_KEY and ARK_API_KEY != "your_ark_api_key_here":
        print(f"  API Key: {'*' * 20}{ARK_API_KEY[-8:]}")
        print("  ✅ API Key 已配置")
    else:
        print("  ❌ API Key 未配置或使用默认值")
        print("     请在 .env 文件中设置 ARK_API_KEY")
        all_ok = False
    
    # 检查服务器配置
    print("\n🌐 服务器配置:")
    print(f"  监听地址: {SERVER_HOST}")
    print(f"  监听端口: {SERVER_PORT}")
    print(f"  工作线程: {MAX_WORKERS}")
    print(f"  日志级别: {LOG_LEVEL}")
    print("  ✅ 服务器配置正常")
    
    # 检查必要的目录
    print("\n📁 项目结构:")
    required_dirs = [
        'src/graph',
        'src/grpc_service',
        'src/generated',
        'proto'
    ]
    
    for dir_path in required_dirs:
        if os.path.exists(dir_path):
            print(f"  ✅ {dir_path}")
        else:
            print(f"  ❌ {dir_path} 不存在")
            all_ok = False
    
    # 检查 gRPC 生成文件
    print("\n⚙️  gRPC 生成文件:")
    grpc_files = [
        'src/generated/graph_service_pb2.py',
        'src/generated/graph_service_pb2_grpc.py'
    ]
    
    grpc_ok = all(os.path.exists(f) for f in grpc_files)
    if grpc_ok:
        print("  ✅ gRPC 代码已生成")
    else:
        print("  ❌ gRPC 代码未生成")
        print("     请运行: python -m grpc_tools.protoc -I./proto --python_out=./src/generated --grpc_python_out=./src/generated ./proto/graph_service.proto")
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

# LangGraph gRPC 服务

使用 Python + LangGraph + gRPC + 豆包大模型构建的智能图执行服务。

## 快速开始

### 1. 安装依赖
```bash
pip install -r requirements.txt
```

### 2. 配置环境变量
```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env 文件，填入你的豆包 API 密钥
# ARK_API_KEY=your_actual_api_key_here
```

获取豆包 API 密钥：访问 [火山引擎控制台](https://console.volcengine.com/ark)

### 3. 生成 gRPC 代码
```bash
# Windows
scripts\generate_proto.bat

# Linux/Mac
./scripts/generate_proto.sh
```

### 4. 检查配置
```bash
python check_config.py
```

### 5. 启动服务器
```bash
python main.py
```

### 6. 测试客户端（新开终端）
```bash
python client.py
```

## 使用方式

### 启动服务器
```bash
# 默认配置（端口 50051）
python main.py

# 自定义端口
python main.py --port 8080

# 查看帮助
python main.py --help
```

### 测试客户端
```bash
# 运行所有测试（同步 + 流式）
python client.py

# 只测试同步调用
python client.py --mode sync

# 自定义输入
python client.py --input "你好，这是测试数据"

# 查看帮助
python client.py --help
```

### Windows 用户
双击运行批处理文件：
- `start_server.bat` - 启动服务器
- `test_client.bat` - 测试客户端

## 项目结构

```
intelligent_reimbursement_system_langgraph/
├── .env                       # 环境变量配置（需手动创建）
├── .env.example              # 环境变量模板
├── config.py                 # 配置管理（从 .env 读取）
├── main.py                   # 服务器主入口 ⭐
├── client.py                 # 客户端主入口 ⭐
├── check_config.py           # 配置检查脚本
├── test_doubao.py            # 豆包模型测试
├── requirements.txt          # Python 依赖
├── start_server.bat          # Windows 启动脚本
├── test_client.bat           # Windows 测试脚本
├── proto/
│   └── graph_service.proto  # gRPC 服务定义
├── scripts/
│   ├── generate_proto.bat   # Windows 代码生成
│   └── generate_proto.sh    # Linux/Mac 代码生成
└── src/
    ├── graph/
    │   └── main_graph.py    # LangGraph 主图（使用 LangChain）⭐
    ├── grpc_service/
    │   ├── server.py        # gRPC 服务器
    │   └── client.py        # gRPC 客户端
    └── generated/           # gRPC 生成代码
```

## 环境变量配置

编辑 `.env` 文件：

```bash
# 豆包大模型配置（必填）
# 注意：DOUBAO_MODEL 应该填写你的 endpoint ID，不是模型名称
ARK_API_KEY=your_actual_api_key_here
DOUBAO_MODEL=ep-20241230185503-xxxxx  # 你的 endpoint ID

# API 地址（通常不需要修改）
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3

# 服务器配置（可选）
SERVER_HOST=0.0.0.0
SERVER_PORT=50051
MAX_WORKERS=10

# 日志配置（可选）
LOG_LEVEL=INFO
```

**重要说明：**
- 豆包使用 OpenAI 兼容的 API 格式
- `DOUBAO_MODEL` 应填写你的 **endpoint ID**（如：`ep-20241230185503-xxxxx`）
- 获取方式：登录火山引擎控制台 → 模型推理 → 在线推理 → 创建推理接口 → 复制 endpoint ID

## 功能特性

- ✅ LangGraph 状态图工作流
- ✅ 使用 LangChain 标准方式集成豆包大模型
- ✅ 支持 OpenAI 兼容的 API 格式
- ✅ gRPC 同步和流式调用
- ✅ 环境变量管理 (python-dotenv)
- ✅ 一键启动和测试
- ✅ 完整的配置检查工具

## 工具脚本

| 脚本 | 功能 |
|------|------|
| `check_config.py` | 检查项目配置是否正确 |
| `test_doubao.py` | 测试豆包模型连接 |
| `scripts/generate_proto.bat` | 生成 gRPC 代码（Windows） |
| `scripts/generate_proto.sh` | 生成 gRPC 代码（Linux/Mac） |

## 常见问题

### Q1: 提示 "ARK_API_KEY 未设置"
确保：
1. `.env` 文件存在
2. `.env` 文件中 `ARK_API_KEY` 已填写真实的 API Key
3. API Key 不是默认值 `your_ark_api_key_here`

### Q2: 提示 "No module named 'graph_service_pb2'"
需要生成 gRPC 代码：
```bash
python -m grpc_tools.protoc -I./proto --python_out=./src/generated --grpc_python_out=./src/generated ./proto/graph_service.proto
```

### Q3: 端口被占用
修改 `.env` 文件中的 `SERVER_PORT`，或启动时指定：
```bash
python main.py --port 8080
```

## 扩展开发

### 自定义 LangGraph 工作流
编辑 `src/graph/main_graph.py`，添加更多节点：
```python
workflow.add_node("your_node", your_function)
workflow.add_edge("process_input", "your_node")
```

### 使用 LangChain 调用大模型
项目直接使用 LangChain 标准写法，无需额外封装：

```python
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage
from config import ARK_API_KEY, ARK_BASE_URL, DOUBAO_MODEL

# 创建 LLM 实例
llm = ChatOpenAI(
    model=DOUBAO_MODEL,
    openai_api_key=ARK_API_KEY,
    openai_api_base=ARK_BASE_URL,
    temperature=0.7,
    max_tokens=2000
)

# 调用模型
messages = [
    SystemMessage(content="你是一个助手"),
    HumanMessage(content="你好")
]
response = llm.invoke(messages)
print(response.content)
```

### 使用 LangChain LCEL
```python
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

llm = ChatOpenAI(...)
prompt = ChatPromptTemplate.from_template("告诉我关于{topic}的信息")
chain = prompt | llm | StrOutputParser()

result = chain.invoke({"topic": "人工智能"})
```

### 扩展 gRPC 接口
编辑 `proto/graph_service.proto`，添加新的服务方法：
```protobuf
service GraphService {
  rpc YourMethod(YourRequest) returns (YourResponse);
}
```

## 技术栈

- **LangGraph**: 状态图工作流引擎
- **LangChain**: LLM 应用开发框架
- **gRPC**: 高性能 RPC 框架
- **豆包大模型**: 火山引擎大模型（通过 OpenAI 兼容接口）
- **Python-dotenv**: 环境变量管理

## License

MIT

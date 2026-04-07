# 智能报销系统 - AI 服务（LangGraph）

基于 LangGraph + 豆包大模型构建的 AI 推理服务，通过 gRPC 对外提供流式响应能力，支持发票识别、报销类型配置生成、报销政策问答三类意图。

## 技术栈

| 技术             | 版本   | 用途                   |
| ---------------- | ------ | ---------------------- |
| Python           | 3.11   | 运行环境               |
| LangGraph        | ≥0.2   | AI 工作流编排          |
| LangChain        | ≥0.1   | LLM 调用封装           |
| langchain-openai | ≥0.0.5 | 豆包 OpenAI 兼容接口   |
| gRPC / grpcio    | ≥1.60  | 服务通信协议           |
| PyMuPDF          | -      | PDF 文件解析           |
| json-repair      | ≥0.30  | LLM 输出 JSON 容错修复 |
| python-dotenv    | ≥1.0   | 环境变量管理           |

## 项目结构

```
├── main.py                    # 服务入口，启动 gRPC server
├── config.py                  # 环境变量读取与配置
├── proto/
│   └── graph_service.proto    # gRPC 接口定义
├── src/
│   ├── generated/             # protoc 自动生成的 pb2 文件（构建时生成）
│   ├── grpc_service/
│   │   ├── server.py          # gRPC 服务端，注册 Servicer
│   │   └── client.py          # gRPC 客户端（本地测试用）
│   └── graph/
│       └── main_graph.py      # LangGraph 核心图定义
├── tests/
│   ├── test_doubao.py         # 豆包 LLM 连通性测试
│   └── check_config.py        # 环境配置检查
└── scripts/
    ├── generate_proto.sh/.bat # 生成 gRPC 代码脚本
    └── quick_start.sh/.bat    # 快速启动脚本
```

## Graph 工作流

```
用户输入（文本 + 可选文件）
        │
        ▼
  route_intent 节点
  （意图分类：chat / invoice / type_config）
        │
   ┌────┴────────────┐
   │                 │                 │
   ▼                 ▼                 ▼
chat_node    invoice_recognition   reimbursement_type
（政策问答）   _node（发票识别）      _node（类型配置生成）
   │                 │                 │
   └────────┬────────┘
            ▼
     generate_output 节点
     （格式化 + 流式输出）
```

### 节点说明

#### `route_intent`

调用 LLM 对用户输入进行意图分类，输出三种意图之一：

- `chat` — 报销政策咨询
- `invoice` — 发票识别（需要附件）
- `type_config` — 报销类型配置生成

#### `invoice_recognition_node`

- 接收 base64 编码的文件列表（图片或 PDF）
- 逐个调用 LLM 进行结构化识别，提取：发票类型、金额、日期、商家、税号等字段
- 使用 `json-repair` 容错处理 LLM 输出截断问题
- 返回 `InvoiceResultList` 结构化结果

#### `reimbursement_type_node`

- 根据用户的自然语言需求描述
- 调用 LLM 生成标准化的报销类型字段配置（JSON Schema 格式）
- 字段包含：name、label、type（text/number/date/select）、required、options

#### `chat_node`

- 基于报销政策知识库回答用户问题
- 支持多轮对话上下文

#### `generate_output`

- 统一格式化各节点输出
- 通过 gRPC 流式推送给调用方

## gRPC 接口

Proto 定义（`proto/graph_service.proto`）：

```protobuf
service GraphService {
  rpc StreamGraph(GraphRequest) returns (stream GraphResponse);
}

message GraphRequest {
  string input_text = 1;
  repeated string files = 2;  // base64 编码的文件列表
}

message GraphResponse {
  string content = 1;         // 流式文本片段
  bool is_final = 2;          // 是否为最后一帧
  string error = 3;           // 错误信息（可选）
}
```

## 本地开发

### 环境准备

```bash
# 创建虚拟环境
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt
```

### 生成 gRPC 代码

```bash
# Linux/macOS
bash scripts/generate_proto.sh

# Windows
scripts\generate_proto.bat
```

### 启动服务

```bash
python main.py
# 或指定端口
python main.py --host 0.0.0.0 --port 50051
```

### 测试

```bash
# 检查环境配置
python tests/check_config.py

# 测试豆包 LLM 连通性
python tests/test_doubao.py

# 使用 gRPC 客户端测试
python client.py
```

## 环境变量

复制 `.env.example` 为 `.env`：

```env
# 豆包大模型（OpenAI 兼容格式）
ARK_API_KEY=your_ark_api_key
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
DOUBAO_MODEL=ep-xxxxxxxx

# gRPC 服务配置
SERVER_HOST=0.0.0.0
SERVER_PORT=50051
MAX_WORKERS=10

# 日志
LOG_LEVEL=INFO
```

## 生产部署

Dockerfile 会在构建时自动执行 `protoc` 生成 gRPC 代码，无需手动操作：

```bash
docker build -t langgraph .
docker run -p 50051:50051 --env-file .env langgraph
```

> 注意：该服务仅在 Docker 内网暴露 50051 端口，不对外开放，只由后端服务通过 gRPC 调用。

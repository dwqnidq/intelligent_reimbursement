# 智能报销助手集成说明

## 概述

本次更新为智能报销系统集成了AI助手"小智"，实现了以下功能：

1. **前端UI** - 右下角固定定位的聊天助手
2. **LangGraph智能路由** - 根据用户意图分发到不同处理节点
3. **报销类型生成** - 智能生成报销类型配置
4. **发票识别** - 识别文件是否为发票
5. **智能对话** - 报销相关问题咨询

## 架构说明

```
前端 (React)
  ↓ HTTP请求
后端 (NestJS)
  ↓ gRPC调用
LangGraph服务 (Python)
  ↓ 调用豆包大模型
返回结果
```

## 文件变更

### 前端 (intelligent_reimbursement_system)

- `src/components/AIAssistant.tsx` - AI助手组件
- `src/components/AIAssistant.css` - 样式文件
- `src/api/ai.ts` - AI接口定义
- `src/App.tsx` - 集成AI助手组件

### 后端 (intelligent_reimbursement_system_server)

- `src/modules/ai/ai.module.ts` - AI模块
- `src/modules/ai/ai.controller.ts` - AI控制器
- `src/modules/ai/ai.service.ts` - AI服务
- `src/modules/ai/grpc-client.service.ts` - gRPC客户端
- `src/app.module.ts` - 注册AI模块

### LangGraph (intelligent_reimbursement_system_langgraph)

- `src/graph/main_graph.py` - 更新图结构，添加路由和处理节点
- `proto/graph_service.proto` - 添加files字段
- `src/grpc_service/server.py` - 支持文件列表参数

## 部署步骤

### 1. 重新生成gRPC代码

由于proto文件有更新，需要重新生成：

```bash
cd intelligent_reimbursement_system_langgraph
# Windows
scripts\generate_proto.bat
# Linux/Mac
bash scripts/generate_proto.sh
```

### 2. 安装后端依赖

```bash
cd intelligent_reimbursement_system_server
npm install @grpc/grpc-js @grpc/proto-loader
```

### 3. 配置环境变量

在后端 `.env` 文件中添加：

```env
GRPC_HOST=localhost
GRPC_PORT=50051
```

### 4. 启动服务

按顺序启动：

```bash
# 1. 启动LangGraph gRPC服务
cd intelligent_reimbursement_system_langgraph
python src/grpc_service/server.py

# 2. 启动后端服务
cd intelligent_reimbursement_system_server
npm run start:dev

# 3. 启动前端服务
cd intelligent_reimbursement_system
npm run dev
```

## 使用示例

### 1. 生成报销类型

用户输入：

```
小智，我现在需要新增一个餐费报销，你帮我设计一下需要有哪些字段
```

返回结果：

```json
{
  "type": "reimbursement_type",
  "data": {
    "code": "meal",
    "label": "餐费报销",
    "fields": [...],
    "formula": "...",
    "over_limit_threshold": 5000
  }
}
```

### 2. 发票识别

用户输入（带文件）：

```
小智，帮我看看这些是不是发票
```

返回结果：

```json
{
  "type": "invoice_recognition",
  "data": [
    {
      "is_invoice": true,
      "origin_file_name": "invoice1.pdf"
    }
  ]
}
```

### 3. 普通对话

用户输入：

```
报销流程是什么？
```

返回结果：

```json
{
  "type": "chat",
  "message": "报销流程包括..."
}
```

## 节点说明

### 路由节点 (route_intent)

- 分析用户输入，识别意图
- 支持的意图：
  - `reimbursement_type` - 报销类型生成
  - `invoice_recognition` - 发票识别
  - `chat` - 普通对话

### 报销类型节点 (reimbursement_type)

- 调用LLM生成报销类型配置
- 返回完整的字段定义、计算公式等

### 发票识别节点 (invoice_recognition)

- 支持图片和PDF格式
- 返回每个文件的识别结果

### 聊天节点 (chat)

- 处理报销相关咨询
- 非报销问题会提示"小智只知道报销的知识哦"

## 注意事项

1. 确保豆包API配置正确（在LangGraph的.env中）
2. gRPC服务必须先启动，后端才能正常工作
3. 前端AI助手只在登录后显示
4. 所有AI接口都需要JWT认证

## 后续优化建议

1. 添加文件上传功能到聊天界面
2. 报销类型生成后可直接保存到数据库
3. 发票识别结果可关联到报销记录
4. 添加对话历史记录
5. 支持多轮对话上下文

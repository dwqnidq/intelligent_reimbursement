# 智能报销系统

基于 AI 的企业报销管理平台，支持发票智能识别、报销类型动态配置、审批流程管理和 AI 政策问答。整个系统由三个子项目组成，通过 Docker Compose 一键编排部署。

## 系统架构

```
┌─────────────────────────────────────────────────────┐
│                     用户浏览器                        │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP / SSE
┌──────────────────────▼──────────────────────────────┐
│         NestJS 后端服务  (server:3000)                │
│  ┌─────────────────┐   ┌──────────────────────────┐ │
│  │  REST API        │   │  托管前端静态文件          │ │
│  │  JWT 鉴权        │   │  (ServeStaticModule)     │ │
│  └────────┬────────┘   └──────────────────────────┘ │
└───────────┼─────────────────────────────────────────┘
            │ gRPC (内网 50051)
┌───────────▼─────────────────────────────────────────┐
│         LangGraph AI 服务  (langgraph:50051)          │
│   意图识别 → 发票识别 / 类型配置生成 / 政策问答         │
│   豆包大模型（OpenAI 兼容接口）                        │
└─────────────────────────────────────────────────────┘
            │
┌───────────▼─────────────────────────────────────────┐
│         MongoDB  (mongo:27017)                       │
│   用户 / 报销单 / 报销类型 / 文件 / 审批日志            │
└─────────────────────────────────────────────────────┘
```

## 子项目说明

### [intelligent_reimbursement_system](./intelligent_reimbursement_system/README.md) — 前端

React 19 + Vite + TypeScript + Ant Design 构建的 SPA 应用。

主要功能：

- 登录 / 注册
- 首页统计看板
- 报销单提交（支持 AI 自动识别发票填充表单）
- 报销单列表与审批
- 报销类型管理（AI 生成动态字段配置）
- AI 助手悬浮聊天面板（流式输出）
- 个人中心与密码修改
- 报销记录导出 Excel

生产环境由 Nginx 托管，`/api` 请求反向代理到后端。

---

### [intelligent_reimbursement_system_server](./intelligent_reimbursement_system_server/README.md) — 后端

NestJS 11 + MongoDB + gRPC 构建的 RESTful API 服务。

主要功能：

- 用户注册 / 登录 / JWT 鉴权
- 报销单 CRUD 与审批流程
- 报销类型动态管理
- 文件上传（七牛云存储）
- AI 接口转发（gRPC → SSE 流式响应给前端）
- 托管前端静态文件（生产环境）
- Swagger API 文档（`/api-docs`）

---

### [intelligent_reimbursement_system_langgraph](./intelligent_reimbursement_system_langgraph/README.md) — AI 服务

Python 3.11 + LangGraph + 豆包大模型构建的 gRPC AI 推理服务。

Graph 节点：

- `route_intent` — 意图分类（发票识别 / 类型配置 / 政策问答）
- `invoice_recognition_node` — 结构化识别发票字段
- `reimbursement_type_node` — 根据自然语言生成报销类型配置
- `chat_node` — 报销政策问答
- `generate_output` — 流式输出最终结果

---

## 快速部署

### 前置条件

- Docker 24+
- Docker Compose v2

### 1. 克隆项目

```bash
git clone https://github.com/dwqnidq/intelligent_reimbursement.git
cd intelligent_reimbursement
```

### 2. 配置环境变量

**`intelligent_reimbursement_system_langgraph/.env`**

```env
ARK_API_KEY=你的豆包API密钥
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
DOUBAO_MODEL=ep-xxxxxxxx
SERVER_HOST=0.0.0.0
SERVER_PORT=50051
```

**`intelligent_reimbursement_system_server/.env`**

```env
PORT=3000
MONGODB_URI=mongodb://mongo:27017/Reimbursement
JWT_SECRET=your_strong_jwt_secret
JWT_EXPIRES_IN=7d
QINIU_ACCESS_KEY=your_access_key
QINIU_SECRET_KEY=your_secret_key
QINIU_BUCKET=your_bucket
QINIU_DOMAIN=https://your-cdn-domain
GRPC_HOST=langgraph
GRPC_PORT=50051
```

### 3. 启动服务

```bash
docker compose up -d --build
```

首次构建需要几分钟（编译前端、安装 Python 依赖）。

### 4. 访问

| 地址                            | 说明             |
| ------------------------------- | ---------------- |
| `http://服务器IP:3000`          | 前端页面         |
| `http://服务器IP:3000/api-docs` | Swagger API 文档 |

### 常用运维命令

```bash
# 查看服务状态
docker compose ps

# 查看日志
docker compose logs -f server
docker compose logs -f langgraph

# 重新构建某个服务
docker compose up -d --build server

# 停止所有服务（数据不丢失）
docker compose down
```

## 本地开发

各子项目独立启动，详见各自 README：

```bash
# 1. 启动 MongoDB（或使用本地 MongoDB）
docker compose up -d mongo

# 2. 启动 AI 服务
cd intelligent_reimbursement_system_langgraph
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python main.py

# 3. 启动后端
cd intelligent_reimbursement_system_server
pnpm install && pnpm start:dev

# 4. 启动前端
cd intelligent_reimbursement_system
npm install && npm run dev
```

## 端口说明

| 端口  | 服务                       | 是否对外暴露 |
| ----- | -------------------------- | ------------ |
| 3000  | NestJS 后端 + 前端静态文件 | 是           |
| 50051 | LangGraph gRPC 服务        | 否（仅内网） |
| 27017 | MongoDB                    | 否（仅内网） |

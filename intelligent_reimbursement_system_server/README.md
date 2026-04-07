# 智能报销系统 - 后端服务

基于 NestJS 11 + MongoDB + gRPC 构建的后端服务，提供 RESTful API、JWT 鉴权、文件上传、AI 流式对话等能力，同时托管前端静态文件。

## 技术栈

| 技术               | 版本 | 用途           |
| ------------------ | ---- | -------------- |
| NestJS             | 11   | 后端框架       |
| TypeScript         | 5.7  | 类型安全       |
| MongoDB + Mongoose | 9    | 数据库         |
| JWT + Passport     | -    | 身份认证       |
| gRPC               | 1.14 | 与 AI 服务通信 |
| Qiniu SDK          | 7    | 文件云存储     |
| Swagger            | 11   | API 文档       |
| pnpm               | 10   | 包管理器       |

## 项目结构

```
src/
├── common/
│   ├── http-exception.filter.ts  # 全局异常过滤器
│   ├── response.interceptor.ts   # 全局响应格式化拦截器
│   └── public.decorator.ts       # @Public() 跳过 JWT 验证装饰器
├── modules/
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── jwt.strategy.ts       # JWT 验证策略
│   │   ├── jwt-auth.guard.ts     # 全局 JWT 守卫
│   │   └── current-user.decorator.ts # @CurrentUser() 装饰器
│   ├── user/
│   │   ├── dto/                  # RegisterDto, LoginDto, ChangePasswordDto
│   │   ├── user.service.ts       # 注册、登录、查询、改密
│   │   └── user.controller.ts
│   ├── reimbursement/
│   │   ├── dto/                  # CreateDto, ApproveDto, SearchDto
│   │   ├── reimbursement.service.ts
│   │   └── reimbursement.controller.ts
│   ├── reimbursement-type/
│   │   ├── dto/
│   │   ├── reimbursement-type.service.ts
│   │   └── reimbursement-type.controller.ts
│   ├── file/
│   │   ├── file.service.ts       # 七牛云上传
│   │   └── file.controller.ts
│   └── ai/
│       ├── grpc-client.service.ts # gRPC 连接 LangGraph
│       ├── ai.service.ts
│       └── ai.controller.ts      # SSE 流式响应
└── schemas/
    ├── user.schema.ts
    ├── reimbursement.schema.ts
    ├── reimbursement-type.schema.ts
    ├── file.schema.ts
    ├── role.schema.ts
    ├── permission.schema.ts
    ├── menu.schema.ts
    └── approval-log.schema.ts
```

## API 接口

> 所有接口统一前缀 `/api`，需要鉴权的接口在请求头携带 `Authorization: Bearer <token>`。
> 完整文档访问 `http://localhost:3000/api-docs`（Swagger UI）。

### 用户模块 `/api/v1/users`

| 方法  | 路径        | 说明                 | 鉴权 |
| ----- | ----------- | -------------------- | ---- |
| POST  | `/register` | 注册                 | 否   |
| POST  | `/login`    | 登录，返回 JWT token | 否   |
| GET   | `/profile`  | 获取当前用户信息     | 是   |
| PATCH | `/password` | 修改密码             | 是   |

### 报销单模块 `/api/v1/reimbursements`

| 方法  | 路径           | 说明                             | 鉴权 |
| ----- | -------------- | -------------------------------- | ---- |
| POST  | `/`            | 提交报销单                       | 是   |
| GET   | `/`            | 获取报销单列表（支持分页、筛选） | 是   |
| GET   | `/:id`         | 获取报销单详情                   | 是   |
| PATCH | `/:id/approve` | 审批通过/拒绝                    | 是   |

### 报销类型模块 `/api/v1/reimbursement-types`

| 方法   | 路径   | 说明         | 鉴权 |
| ------ | ------ | ------------ | ---- |
| POST   | `/`    | 创建报销类型 | 是   |
| GET    | `/`    | 获取所有类型 | 是   |
| GET    | `/:id` | 获取类型详情 | 是   |
| PATCH  | `/:id` | 更新类型     | 是   |
| DELETE | `/:id` | 删除类型     | 是   |

### 文件模块 `/api/v1/files`

| 方法 | 路径      | 说明                           | 鉴权 |
| ---- | --------- | ------------------------------ | ---- |
| POST | `/upload` | 上传文件到七牛云，返回访问 URL | 是   |

### AI 模块 `/api/v1/ai`

| 方法 | 路径    | 说明                           | 鉴权 |
| ---- | ------- | ------------------------------ | ---- |
| POST | `/chat` | 发送消息，SSE 流式返回 AI 响应 | 是   |

## 数据模型

### User

```
username, password(bcrypt), role, createdAt
```

### Reimbursement

```
title, amount, type, status(pending/approved/rejected),
applicant, attachments[], dynamicFields{}, approvalLog[], createdAt
```

### ReimbursementType

```
name, description, fields[{name, label, type, required, options[]}]
```

## 本地开发

```bash
# 安装依赖
pnpm install

# 启动开发服务器（热重载）
pnpm start:dev

# 构建
pnpm build

# 生产启动
pnpm start:prod
```

## 环境变量

复制并配置 `.env`：

```env
PORT=3000
MONGODB_URI=mongodb://localhost:27017/Reimbursement
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=7d

# 七牛云文件存储
QINIU_ACCESS_KEY=your_access_key
QINIU_SECRET_KEY=your_secret_key
QINIU_BUCKET=your_bucket
QINIU_DOMAIN=https://your-cdn-domain

# gRPC AI 服务地址
GRPC_HOST=localhost
GRPC_PORT=50051
```

## 生产部署

Dockerfile 采用三阶段构建：

1. 构建前端静态文件（Node 20）
2. 编译 NestJS 后端（Node 20）
3. 生产镜像：运行后端，同时通过 `ServeStaticModule` 托管前端

```bash
# 在项目根目录执行（构建上下文为根目录）
docker build -f intelligent_reimbursement_system_server/Dockerfile -t server .
```

服务启动后：

- `http://localhost:3000` — 前端页面
- `http://localhost:3000/api/*` — 后端接口
- `http://localhost:3000/api-docs` — Swagger 文档

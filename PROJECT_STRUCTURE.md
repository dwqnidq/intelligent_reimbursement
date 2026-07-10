# 智能报销系统 — 项目结构说明

> 本文档供 AI 编程助手快速定位文件和理解项目结构。
> 三个子项目均位于 `intelligent_reimbursement/` 目录下。

---

## 总体架构

```
intelligent_reimbursement/
├── intelligent_reimbursement_system/          # 项目1: 前端 (React + Vite)
├── intelligent_reimbursement_system_server/   # 项目2: 后端 (NestJS)
├── intelligent_reimbursement_system_langgraph/ # 项目3: AI 服务 (Python + LangGraph)
├── .env.dev.example                           # 开发环境变量模板
├── .env.prod.example                          # 生产环境变量模板
├── docker-compose.yml                         # Docker 编排文件
├── AI_ASSISTANT_SETUP.md                      # AI 助手配置说明
├── DEPLOYMENT_CHECK.txt                       # 部署检查清单
└── docs/                                      # 设计文档与会议记录
```

**调用链**：浏览器 → 前端(Nginx/Vite) → 后端(NestJS :3000) → AI服务(gRPC :50051) → 豆包大模型

---

## 项目1: 前端 — `intelligent_reimbursement_system/`

React 19 + Vite + TypeScript + Ant Design 构建的 SPA 应用。

### 根目录配置

| 文件 | 作用 |
|------|------|
| `package.json` | 项目依赖与脚本（`dev`/`build`/`preview`） |
| `vite.config.ts` | Vite 构建配置（代理、别名等） |
| `tsconfig.json` | TypeScript 主配置 |
| `tsconfig.app.json` | 应用代码 TS 配置 |
| `tsconfig.node.json` | Node 端 TS 配置（vite.config 等） |
| `eslint.config.js` | ESLint 代码检查规则 |
| `index.html` | SPA 入口 HTML |
| `Dockerfile` | 前端 Docker 镜像构建 |
| `nginx.conf` | Nginx 配置（生产环境反向代理 `/api`） |
| `CHANGELOG.md` | 变更日志 |
| `README.md` | 前端项目说明 |

### `src/` 源码目录

#### 入口与全局

| 文件 | 作用 |
|------|------|
| `main.tsx` | 应用入口，挂载 React 根组件 |
| `App.tsx` | 根组件，定义路由结构、全局配置（Ant Design 中文化等） |
| `index.css` | 全局样式 |

#### `src/api/` — 后端 API 调用层

| 文件 | 作用 |
|------|------|
| `http.ts` | Axios 实例封装（baseURL、拦截器、token 注入） |
| `user.ts` | 用户相关 API（登录、注册、菜单、修改密码等） |
| `reimbursement.ts` | 报销单 API（创建、查询、审批、搜索） |
| `reimbursementType.ts` | 报销类型 API（CRUD、AI 生成配置） |
| `approvalFlow.ts` | 审批流程 API |
| `approvalRecord.ts` | 审批记录 API |
| `department.ts` | 部门管理 API |
| `employee.ts` | 员工管理 API |
| `role.ts` | 角色管理 API |
| `file.ts` | 文件上传 API |
| `menu.ts` | 菜单管理 API |
| `opinion.ts` | 意见反馈 API |
| `ai.ts` | AI 接口调用（SSE 流式） |

#### `src/pages/` — 页面组件

| 文件 | 作用 |
|------|------|
| `LoginPage.tsx` | 登录页 |
| `RegisterPage.tsx` | 注册页 |
| `PasswordSetupPage.tsx` | 首次密码设置页（飞书 OAuth 后） |
| `SetTokenPage.tsx` | Token 设置页 |
| `DashboardPage.tsx` | 首页统计看板 |
| `ReimbursementForm.tsx` | 报销单提交表单（含 AI 发票识别） |
| `ReimbursementList.tsx` | 报销单列表页 |
| `ReimbursementTypeCreate.tsx` | 报销类型创建/编辑页（含 AI 生成） |
| `ApprovalFlowManage.tsx` | 审批流程管理页 |
| `PendingApprovalPage.tsx` | 待审批列表页 |
| `ApprovalHistoryPage.tsx` | 审批历史页 |
| `DepartmentManage.tsx` | 部门管理页 |
| `EmployeeManage.tsx` | 员工管理页 |
| `RoleManage.tsx` | 角色管理页 |
| `PermissionManage.tsx` | 权限管理页 |
| `MenuManage.tsx` | 菜单管理页 |
| `OpinionPage.tsx` | 意见反馈列表页 |
| `OpinionSubmitPage.tsx` | 意见反馈提交页 |
| `ProfilePage.tsx` | 个人中心页 |

#### `src/components/` — 公共组件

| 文件 | 作用 |
|------|------|
| `AIAssistant.tsx` | AI 助手悬浮聊天面板（流式输出） |
| `AIAssistant.css` | AI 助手样式 |
| `FilePreviewModal.tsx` | 文件预览弹窗（图片/PDF） |
| `ReimbursementTypeAttachmentRemarkSection.tsx` | 报销类型的附件与备注配置区段 |

#### `src/layouts/` — 布局组件

| 文件 | 作用 |
|------|------|
| `MainLayout.tsx` | 主布局（侧边栏导航 + 内容区） |

#### `src/router/` — 路由相关

| 文件 | 作用 |
|------|------|
| `AuthGuard.tsx` | 路由守卫（未登录跳转登录页） |
| `componentMap.tsx` | 菜单路径 → 页面组件的映射表 |
| `iconMap.tsx` | 菜单图标名 → 图标组件的映射表 |

#### `src/context/` — React Context

| 文件 | 作用 |
|------|------|
| `UserContext.tsx` | 用户上下文（当前用户信息、菜单数据） |

#### `src/store/` — Zustand 状态管理

| 文件 | 作用 |
|------|------|
| `useAuthStore.ts` | 认证状态（token 存储、登录/登出） |
| `useAIStore.ts` | AI 助手状态（对话历史、开关） |
| `useThemeStore.ts` | 主题状态（深色/浅色模式） |

#### `src/utils/` — 工具函数

| 文件 | 作用 |
|------|------|
| `exportExcel.ts` | 报销记录导出为 Excel 文件 |

#### `src/assets/` — 静态资源

| 文件 | 作用 |
|------|------|
| `hero.png` | 首页/登录页装饰图 |
| `react.svg` / `vite.svg` | Logo 图标 |

#### `public/` — 公共静态文件

| 文件 | 作用 |
|------|------|
| `favicon.svg` | 网站图标 |
| `icons.svg` | SVG 图标合集（sprite） |

#### `docs/` — 前端文档

| 文件 | 作用 |
|------|------|
| `报销类型管理使用手册.md` | 报销类型管理功能使用说明 |
| `使用说明.md` | 前端整体使用说明 |

---

## 项目2: 后端 — `intelligent_reimbursement_system_server/`

NestJS 11 + MongoDB + gRPC 构建的 RESTful API 服务。

### 根目录配置

| 文件 | 作用 |
|------|------|
| `package.json` | 依赖与脚本（`start:dev`/`build`/`start:prod`） |
| `tsconfig.json` | TypeScript 主配置 |
| `tsconfig.build.json` | 构建专用 TS 配置 |
| `nest-cli.json` | NestJS CLI 配置 |
| `eslint.config.mjs` | ESLint 规则 |
| `.prettierrc` | Prettier 格式化规则 |
| `Dockerfile` | 后端 Docker 镜像构建（含前端打包产物） |
| `swagger.json` | Swagger API 文档静态导出 |
| `README.md` | 后端项目说明 |
| `.env` | 环境变量（本地开发用，不入库） |
| `.env.development.example` | 开发环境变量模板 |
| `.env.production.example` | 生产环境变量模板 |

### `src/` 源码目录

#### 入口与根模块

| 文件 | 作用 |
|------|------|
| `main.ts` | 应用入口（Bootstrap：CORS、全局管道、JWT 守卫、Swagger、端口监听） |
| `app.module.ts` | 根模块（注册所有子模块、MongoDB 连接、静态文件托管） |

#### `src/common/` — 公共基础设施

| 文件 | 作用 |
|------|------|
| `response.interceptor.ts` | 全局响应拦截器（统一 `{ code, data, message }` 格式） |
| `http-exception.filter.ts` | 全局异常过滤器（统一错误响应） |
| `no-wrap.interceptor.ts` | 跳过统一包装的拦截器（用于 SSE 等特殊场景） |
| `public.decorator.ts` | `@Public()` 装饰器（标记接口跳过 JWT 验证） |

#### `src/modules/` — 业务模块

每个模块遵循 NestJS 标准结构：`controller` → `service` → `module` + `dto/`

##### `auth/` — 认证模块

| 文件 | 作用 |
|------|------|
| `auth.module.ts` | 认证模块注册（JWT 策略） |
| `jwt.strategy.ts` | JWT 策略实现（从 token 解析用户） |
| `jwt-auth.guard.ts` | JWT 全局守卫（`@Public()` 跳过） |
| `current-user.decorator.ts` | `@CurrentUser()` 装饰器（从 request 提取用户） |

##### `user/` — 用户模块

| 文件 | 作用 |
|------|------|
| `user.controller.ts` | 用户接口（注册、登录、获取信息、修改密码、Token 刷新） |
| `user.service.ts` | 用户业务逻辑（密码哈希、JWT 签发） |
| `user.module.ts` | 用户模块注册 |
| `dto/login.dto.ts` | 登录请求 DTO |
| `dto/register.dto.ts` | 注册请求 DTO |
| `dto/change-password.dto.ts` | 修改密码 DTO |
| `dto/set-password.dto.ts` | 首次设置密码 DTO |
| `dto/refresh-token.dto.ts` | Token 刷新 DTO |

##### `reimbursement/` — 报销单模块

| 文件 | 作用 |
|------|------|
| `reimbursement.controller.ts` | 报销单接口（创建、查询、搜索、审批） |
| `reimbursement.service.ts` | 报销单业务逻辑 |
| `reimbursement.module.ts` | 报销单模块注册 |
| `dto/create-reimbursement.dto.ts` | 创建报销单 DTO |
| `dto/search-reimbursement.dto.ts` | 搜索/筛选 DTO |
| `dto/approve-reimbursement.dto.ts` | 审批操作 DTO |

##### `reimbursement-type/` — 报销类型模块

| 文件 | 作用 |
|------|------|
| `reimbursement-type.controller.ts` | 报销类型接口（CRUD） |
| `reimbursement-type.service.ts` | 报销类型业务逻辑 |
| `reimbursement-type.module.ts` | 模块注册 |
| `dto/create-reimbursement-type.dto.ts` | 创建类型 DTO |
| `dto/update-reimbursement-type.dto.ts` | 更新类型 DTO |

##### `department/` — 部门模块

| 文件 | 作用 |
|------|------|
| `department.controller.ts` | 部门 CRUD 接口 |
| `department.service.ts` | 部门业务逻辑 |
| `department.module.ts` | 模块注册 |
| `dto/create-department.dto.ts` | 创建部门 DTO |
| `dto/update-department.dto.ts` | 更新部门 DTO |

##### `employee/` — 员工模块

| 文件 | 作用 |
|------|------|
| `employee.controller.ts` | 员工 CRUD 接口 |
| `employee.service.ts` | 员工业务逻辑 |
| `employee.module.ts` | 模块注册 |
| `dto/create-employee.dto.ts` | 创建员工 DTO |
| `dto/update-employee.dto.ts` | 更新员工 DTO |

##### `approval-flow/` — 审批流程模块

| 文件 | 作用 |
|------|------|
| `approval-flow.controller.ts` | 审批流程 CRUD 接口 |
| `approval-flow.service.ts` | 审批流程业务逻辑 |
| `approval-flow.module.ts` | 模块注册 |
| `dto/create-approval-flow.dto.ts` | 创建流程 DTO |
| `dto/update-approval-flow.dto.ts` | 更新流程 DTO |

##### `approval-record/` — 审批记录模块

| 文件 | 作用 |
|------|------|
| `approval-record.controller.ts` | 审批记录查询接口 |
| `approval-record.service.ts` | 审批记录业务逻辑 |
| `approval-record.module.ts` | 模块注册 |

##### `role/` — 角色模块

| 文件 | 作用 |
|------|------|
| `role.controller.ts` | 角色 CRUD 接口 |
| `role.service.ts` | 角色业务逻辑 |
| `role.module.ts` | 模块注册 |
| `dto/create-role.dto.ts` | 创建角色 DTO |
| `dto/update-role.dto.ts` | 更新角色 DTO |

##### `permission/` — 权限模块

| 文件 | 作用 |
|------|------|
| `permission.controller.ts` | 权限 CRUD 接口 |
| `permission.service.ts` | 权限业务逻辑 |
| `permission.module.ts` | 模块注册 |

##### `menu/` — 菜单模块

| 文件 | 作用 |
|------|------|
| `menu.controller.ts` | 菜单 CRUD 接口（动态菜单） |
| `menu.service.ts` | 菜单业务逻辑 |
| `menu.module.ts` | 模块注册 |
| `dto/create-menu.dto.ts` | 创建菜单 DTO |
| `dto/update-menu.dto.ts` | 更新菜单 DTO |

##### `file/` — 文件模块

| 文件 | 作用 |
|------|------|
| `file.controller.ts` | 文件上传接口（七牛云） |
| `file.service.ts` | 文件上传/删除业务逻辑（七牛云 SDK） |
| `file.module.ts` | 模块注册 |

##### `opinion/` — 意见反馈模块

| 文件 | 作用 |
|------|------|
| `opinion.controller.ts` | 意见反馈接口（提交、列表、状态更新） |
| `opinion.service.ts` | 意见反馈业务逻辑 |
| `opinion.module.ts` | 模块注册 |
| `dto/create-opinion.dto.ts` | 创建反馈 DTO |
| `dto/update-opinion-status.dto.ts` | 更新反馈状态 DTO |

##### `ai/` — AI 接口模块

| 文件 | 作用 |
|------|------|
| `ai.controller.ts` | AI 接口（SSE 流式转发给前端） |
| `ai.service.ts` | AI 业务逻辑（调用 gRPC 客户端） |
| `grpc-client.service.ts` | gRPC 客户端封装（连接 LangGraph 服务） |
| `ai.module.ts` | 模块注册 |

#### `src/schemas/` — MongoDB Schema 定义

| 文件 | 作用 |
|------|------|
| `user.schema.ts` | 用户表结构（用户名、密码哈希、角色、飞书ID） |
| `reimbursement_records.schema.ts` | 报销记录表（金额、类型、状态、附件、审批流） |
| `reimbursement_type.schema.ts` | 报销类型表（名称、动态字段定义、审批流程绑定） |
| `approval_flow.schema.ts` | 审批流程表（步骤、审批人） |
| `approval_log.schema.ts` | 审批日志表（操作记录） |
| `approval_record.schema.ts` | 审批记录表（关联报销单与流程） |
| `department.schema.ts` | 部门表 |
| `employee.schema.ts` | 员工表（关联部门） |
| `role.schema.ts` | 角色表 |
| `permission.schema.ts` | 权限表 |
| `menu.schema.ts` | 菜单表（树形结构） |
| `file.schema.ts` | 文件表（七牛云 key、关联信息） |
| `opinion.schema.ts` | 意见反馈表 |
| `feishu_user.schema.ts` | 飞书用户关联表 |

#### `proto/` — gRPC Proto 定义

| 文件 | 作用 |
|------|------|
| `graph_service.proto` | gRPC 服务定义（与 LangGraph 项目共享） |
| `README.md` | Proto 文件说明 |

#### `test/` — 测试

| 文件 | 作用 |
|------|------|
| `app.e2e-spec.ts` | 端到端测试 |
| `jest-e2e.json` | Jest E2E 测试配置 |

---

## 项目3: AI 服务 — `intelligent_reimbursement_system_langgraph/`

Python 3.11 + LangGraph + 豆包大模型构建的 gRPC AI 推理服务。

### 根目录配置

| 文件 | 作用 |
|------|------|
| `main.py` | 应用入口（启动 gRPC 服务器） |
| `client.py` | gRPC 客户端示例（测试用） |
| `pyproject.toml` | Python 项目配置（包元数据、构建配置） |
| `requirements.txt` | Python 依赖清单 |
| `Dockerfile` | AI 服务 Docker 镜像构建 |
| `README.md` | AI 服务项目说明 |
| `.env` | 环境变量（API Key 等，不入库） |
| `.env.example` | 环境变量模板 |
| `.dockerignore` | Docker 构建排除规则 |
| `.gitignore` | Git 排除规则 |

### `scripts/` — 脚本

| 文件 | 作用 |
|------|------|
| `generate_proto.sh` | 生成 gRPC Python 代码（Linux/macOS） |
| `generate_proto.bat` | 生成 gRPC Python 代码（Windows） |
| `quick_start.sh` | 快速启动脚本（Linux/macOS） |
| `quick_start.bat` | 快速启动脚本（Windows） |

### `proto/` — gRPC Proto 定义

| 文件 | 作用 |
|------|------|
| `graph_service.proto` | gRPC 服务定义（GraphService：流式处理报销请求） |

### `src/reimbursement_langgraph/` — 核心源码

| 文件 | 作用 |
|------|------|
| `__init__.py` | 包初始化 |
| `config.py` | 配置管理（Pydantic Settings：豆包 API Key、服务器端口、MongoDB 等） |
| `models.py` | 数据模型定义（`GraphState` 状态类型、Pydantic 模型：发票识别结果、字段赋值等） |
| `graph.py` | **LangGraph 图定义**（核心！定义节点、路由逻辑、图编译） |
| `llm.py` | LLM 初始化（豆包大模型实例化，OpenAI 兼容接口） |
| `extract.py` | 发票识别逻辑（单文件识别、表单字段提取） |
| `stream.py` | 流式输出处理 |

#### `src/reimbursement_langgraph/db/` — 数据库访问

| 文件 | 作用 |
|------|------|
| `__init__.py` | 包初始化 |
| `reimbursement_types_repo.py` | 报销类型数据仓库（从 MongoDB 读取启用的报销类型） |

#### `src/reimbursement_langgraph/generated/` — gRPC 生成代码

| 文件 | 作用 |
|------|------|
| `__init__.py` | 包初始化 |
| `graph_service_pb2.py` | Protobuf 消息类（由 protoc 自动生成） |
| `graph_service_pb2_grpc.py` | gRPC 服务存根（由 protoc 自动生成） |

#### `src/reimbursement_langgraph/grpc_service/` — gRPC 服务层

| 文件 | 作用 |
|------|------|
| `__init__.py` | 包初始化 |
| `server.py` | gRPC 服务器实现（接收请求、调用 Graph、流式返回结果） |
| `client.py` | gRPC 客户端封装 |

#### `src/reimbursement_langgraph/prompt/` — 提示词模板

| 文件 | 作用 |
|------|------|
| `reimbursement_type_generator_prompt.md` | 报销类型配置生成的系统提示词 |

### `tests/` — 测试

| 文件 | 作用 |
|------|------|
| `check_config.py` | 配置检查脚本（验证环境变量是否正确） |
| `test_doubao.py` | 豆包大模型连通性测试 |

---

## LangGraph 图节点说明

`graph.py` 中定义的 AI 处理流程：

```
用户输入
  │
  ▼
route_intent（意图分类）
  ├── "invoice_recognition" → invoice_recognition_node（发票识别）
  ├── "reimbursement_type"  → reimbursement_type_node（报销类型配置生成）
  └── "chat"                → chat_node（政策问答）
  │
  ▼
generate_output（流式输出最终结果）
```

---

## 跨项目通信

| 方向 | 协议 | 说明 |
|------|------|------|
| 前端 → 后端 | HTTP REST + SSE | API 请求统一走 `/api` 前缀，AI 接口用 SSE 流式 |
| 后端 → AI 服务 | gRPC (端口 50051) | `grpc-client.service.ts` 调用 LangGraph 服务 |
| 后端 → MongoDB | MongoDB 协议 | Mongoose ODM，数据库名 `Reimbursement` |
| AI 服务 → MongoDB | MongoDB 协议 | 读取报销类型配置（`reimbursement_types_repo.py`） |
| AI 服务 → 豆包大模型 | HTTP (OpenAI 兼容) | `llm.py` 通过 `ark.cn-beijing.volces.com` 调用 |

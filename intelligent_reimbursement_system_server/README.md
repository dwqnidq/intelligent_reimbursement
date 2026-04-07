# 智能报销系统 - 后端服务

基于 NestJS + TypeScript + MongoDB 构建的智能报销系统后端，提供用户管理、报销单管理、报销类型管理、文件上传等 RESTful API，集成 JWT 鉴权、Swagger 文档、七牛云存储及 gRPC 客户端。

## 技术栈

- 框架：NestJS 11
- 语言：TypeScript
- 数据库：MongoDB（Mongoose ODM）
- 鉴权：JWT（Passport）
- 文件存储：七牛云
- 接口文档：Swagger
- gRPC：@grpc/grpc-js + @grpc/proto-loader
- 校验：class-validator + class-transformer

## 项目结构

```
src/
├── main.ts                              # 应用入口
├── app.module.ts                        # 根模块
├── schemas/                             # Mongoose Schema 定义
│   ├── user.schema.ts                   # 用户
│   ├── role.schema.ts                   # 角色
│   ├── permission.schema.ts             # 权限
│   ├── menu.schema.ts                   # 菜单
│   ├── reimbursement.schema.ts          # 报销单
│   ├── reimbursement-type.schema.ts     # 报销类型
│   ├── file.schema.ts                   # 文件
│   └── approval-log.schema.ts           # 审批日志
└── modules/
    ├── auth/                            # 鉴权模块
    │   ├── auth.module.ts
    │   ├── jwt.strategy.ts              # JWT 策略
    │   ├── jwt-auth.guard.ts            # JWT 守卫
    │   └── current-user.decorator.ts    # 当前用户装饰器
    ├── user/                            # 用户模块
    │   ├── user.module.ts
    │   ├── user.controller.ts
    │   ├── user.service.ts
    │   └── dto/
    ├── reimbursement/                   # 报销单模块
    │   ├── reimbursement.module.ts
    │   ├── reimbursement.controller.ts
    │   ├── reimbursement.service.ts
    │   └── dto/
    ├── reimbursement-type/              # 报销类型模块
    │   ├── reimbursement-type.module.ts
    │   ├── reimbursement-type.controller.ts
    │   ├── reimbursement-type.service.ts
    │   └── dto/
    └── file/                            # 文件上传模块
        ├── file.module.ts
        ├── file.controller.ts
        └── file.service.ts
proto/
└── graph_service.proto                  # gRPC 服务定义（LangGraph）
```

## 快速开始

### 环境要求

- Node.js >= 18
- MongoDB >= 6.0
- npm >= 9

### 安装与启动

```bash
# 安装依赖
npm install

# 开发模式（热重载）
npm run start:dev

# 生产构建
npm run build
npm run start:prod
```

### 环境变量

在项目根目录创建 `.env` 文件：

```env
PORT=3000
MONGODB_URI=mongodb://localhost:27017/Reimbursement
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=7d
CORS_ORIGIN=*

# 七牛云
QINIU_ACCESS_KEY=your_access_key
QINIU_SECRET_KEY=your_secret_key
QINIU_BUCKET=your_bucket
QINIU_DOMAIN=https://your-cdn-domain.com

# gRPC
GRPC_SERVER_ADDRESS=localhost:50051
```

## API 接口

接口文档：启动后访问 `http://localhost:3000/api-docs`

所有接口统一前缀 `/api/v1`

### 用户模块 `/api/v1/user`

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| POST | /register | 否 | 用户注册 |
| POST | /login | 否 | 登录，返回 token、权限、菜单树 |
| GET | /profile | 是 | 获取当前用户信息 |

### 报销类型模块 `/api/v1/reimbursement-types`

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | / | 否 | 获取所有启用的报销类型 |
| POST | / | 是 | 创建报销类型 |
| PUT | /:id | 是 | 更新报销类型 |
| DELETE | /:id | 是 | 删除报销类型 |

### 报销单模块 `/api/v1/reimbursements`

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | / | 是 | 获取报销单列表（管理员全部，普通用户自己的） |
| GET | /search | 是 | 多条件筛选报销单 |
| POST | / | 是 | 提交报销单 |
| PUT | /:id/approve | 是 | 审批（通过/驳回） |
| PUT | /:id/withdraw | 是 | 撤回报销单 |

### 文件模块 `/api/v1/files`

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| POST | /upload | 是 | 上传文件到七牛云（JPG/PNG/WEBP/PDF，限 10MB） |

## 数据模型

### User 用户
| 字段 | 类型 | 说明 |
|------|------|------|
| username | string | 登录用户名，唯一 |
| password | string | bcrypt 加密密码 |
| email | string | 邮箱，唯一 |
| real_name | string | 真实姓名 |
| phone | string | 手机号 |
| avatar | string | 头像 URL |
| department | string | 所属部门 |
| status | number | 1 启用 / 0 禁用 |
| roles | ObjectId[] | 关联角色 |

### Role 角色
| 字段 | 类型 | 说明 |
|------|------|------|
| name | string | 角色标识符（admin/finance/employee） |
| label | string | 显示名称 |
| permissions | ObjectId[] | 关联权限 |
| menus | ObjectId[] | 关联菜单 |

### ReimbursementType 报销类型
| 字段 | 类型 | 说明 |
|------|------|------|
| code | string | 类型标识符（purchase/travel） |
| label | string | 显示名称 |
| fields | FieldConfig[] | 表单字段配置 |
| formula | string | 计算公式表达式 |
| over_limit_threshold | number | 超额标准（元），null 不设限 |
| status | number | 1 启用 / 0 禁用 |

### Reimbursement 报销单
| 字段 | 类型 | 说明 |
|------|------|------|
| applicant | ObjectId | 申请人 |
| category | ObjectId | 报销类型 |
| amount | number | 报销金额（元） |
| detail | object | 类型特有字段 |
| attachments | ObjectId[] | 附件列表 |
| status | string | pending/approved/rejected/withdrawn |
| approver | ObjectId | 审批人 |
| apply_date | string | 申请日期 |
| is_over_limit | boolean | 是否超额 |

### 查询返回扩展字段
| 字段 | 说明 |
|------|------|
| applicant_name | 申请人真实姓名（populate 自 User） |
| calculated_amount | 根据 formula 动态计算的总价 |

## 核心功能

### RBAC 权限体系
User → Role → Permission/Menu 三级关联，登录后返回权限列表和菜单树，支持前端动态路由。

### 动态金额计算
报销类型配置 `formula` 表达式和 `is_calculate` 标记字段，查询报销单时自动通过 `new Function` 动态计算总价。

### 超额判断
报销类型配置 `over_limit_threshold`，报销单通过 `is_over_limit` 标记是否超额。

### gRPC 集成
通过 `proto/graph_service.proto` 定义与 LangGraph 智能体端的通信协议，支持一次性调用和流式调用。

## 常用命令

```bash
npm run start:dev      # 开发模式
npm run build          # 构建
npm run start:prod     # 生产模式
npm run lint           # 代码检查
npm run test           # 单元测试
npm run format         # 代码格式化
```

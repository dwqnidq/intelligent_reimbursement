# 智能报销系统 - 前端

基于 React 19 + Vite + TypeScript 构建的前端应用，提供报销单提交、审批管理、AI 智能助手等功能界面。

## 技术栈

| 技术         | 版本 | 用途         |
| ------------ | ---- | ------------ |
| React        | 19   | UI 框架      |
| TypeScript   | 5.9  | 类型安全     |
| Vite         | 8    | 构建工具     |
| Ant Design   | 6    | UI 组件库    |
| Tailwind CSS | 4    | 样式工具     |
| Zustand      | 5    | 全局状态管理 |
| React Router | 7    | 前端路由     |
| Axios        | 1.x  | HTTP 请求    |
| @dnd-kit     | 6/10 | 拖拽排序     |

## 项目结构

```
src/
├── api/                  # API 请求层
│   ├── http.ts           # axios 实例，JWT 拦截器
│   ├── user.ts           # 用户相关接口
│   ├── reimbursement.ts  # 报销单接口
│   ├── reimbursementType.ts # 报销类型接口
│   ├── file.ts           # 文件上传接口
│   └── ai.ts             # AI 助手流式接口
├── components/
│   ├── AIAssistant.tsx   # 悬浮 AI 聊天面板
│   └── FilePreviewModal.tsx # 图片/PDF 预览弹窗
├── context/
│   └── UserContext.tsx   # 用户信息全局 Context
├── layouts/
│   └── MainLayout.tsx    # 主布局（侧边栏 + 顶栏）
├── pages/
│   ├── LoginPage.tsx     # 登录页
│   ├── RegisterPage.tsx  # 注册页
│   ├── DashboardPage.tsx # 首页统计看板
│   ├── ProfilePage.tsx   # 个人中心
│   ├── ReimbursementForm.tsx  # 报销单提交
│   ├── ReimbursementList.tsx  # 报销单列表/审批
│   └── ReimbursementTypeCreate.tsx # 报销类型管理
├── router/
│   ├── AuthGuard.tsx     # 路由鉴权守卫
│   ├── componentMap.tsx  # 动态路由组件映射
│   └── iconMap.tsx       # 菜单图标映射
├── store/
│   ├── useAuthStore.ts   # 登录态、token 管理
│   ├── useThemeStore.ts  # 主题（亮/暗）
│   └── useAIStore.ts     # AI 助手开关状态
└── utils/
    └── exportExcel.ts    # 报销记录导出 Excel
```

## 功能模块

### 认证

- 账号密码登录，JWT token 存储于 localStorage
- 路由守卫自动拦截未登录访问，跳转登录页

### 首页看板

- 展示报销统计数据（待审批、已通过、已拒绝数量）
- 最近报销记录快速预览

### 报销单管理

- 提交报销单，支持多文件上传（发票图片/PDF）
- AI 自动识别发票内容并填充表单字段
- 列表页支持状态筛选、关键词搜索、日期范围过滤
- 审批人可在列表页直接审批/拒绝，填写审批意见
- 支持导出报销记录为 Excel 文件

### 报销类型管理

- 通过自然语言描述，AI 自动生成报销类型的动态字段配置
- 支持拖拽排序字段顺序
- 管理员可增删改报销类型

### AI 助手

- 悬浮聊天面板，支持流式输出（SSE）
- 可上传文件进行发票识别
- 支持报销政策问答

### 个人中心

- 查看个人信息
- 修改密码

## 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器（代理 /api 到 localhost:3000）
npm run dev

# 构建生产包
npm run build
```

开发服务器默认运行在 `http://localhost:5173`，`/api` 请求自动代理到后端 `http://localhost:3000`。

## 环境变量

复制 `.env.example` 为 `.env`：

```env
VITE_API_BASE_URL=/api/v1
```

## 生产部署

项目通过 Docker 多阶段构建，最终由 Nginx 托管静态文件：

```bash
docker build -t frontend .
```

Nginx 配置支持：

- SPA 路由（所有路径回退到 `index.html`）
- `/api` 反向代理到后端服务，关闭缓冲以支持 SSE 流式响应

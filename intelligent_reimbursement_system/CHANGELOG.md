# 智能报账平台前端开发记录

## 技术栈

- React 19 + TypeScript + Vite
- Ant Design 6
- Tailwind CSS 4
- Zustand（状态管理）
- React Router 7
- axios（HTTP 请求）
- @dnd-kit（拖拽排序）
- dayjs（日期处理）
- xlsx-js-style + file-saver（Excel 导出）

---

## 功能开发记录

### 基础架构

- 搭建 React + Vite + TypeScript + Tailwind CSS 项目
- 封装 axios HTTP 客户端，统一处理请求拦截、响应拦截和错误提示
- 使用 Zustand 实现持久化的用户认证状态管理（token、用户信息、权限、菜单）
- 使用 Zustand 实现主题状态管理（暗色/亮色切换）
- 配置 Vite 代理，支持局域网访问，将 `/api` 请求代理到本地后端服务
- 配置 Ant Design 中文语言包，dayjs 设置中文 locale

### 路由与权限

- 实现 `AuthGuard` 路由守卫，未登录自动跳转登录页
- 支持基于权限标识的路由访问控制（`reimbursement:approve`）
- 路由结构：登录、注册、首页（Dashboard）、填写报销单、报销记录、异常记录、报销类型管理、个人信息

### 布局

- 实现响应式主布局，桌面端侧边栏 + 移动端抽屉菜单
- 顶部 Header 包含页面标题、暗色模式切换、用户下拉菜单（个人信息、退出登录）
- 侧边栏菜单根据角色动态显示：
  - 普通用户：首页、填写报销单、报销记录
  - 管理员：首页、报销记录、异常记录、报销类型管理

### 登录 / 注册页面

- 登录页：用户名 + 密码，登录成功写入 token 和用户信息
- 注册页：用户名、密码、确认密码、真实姓名、手机号、邮箱

### 首页（数据看板）

- 月份选择器，默认当前月
- 统计卡片：本月报销总金额、总笔数、超额笔数（基于 `is_over_limit` 字段）、待审核笔数
- 管理员：快捷入口（报销记录、异常记录、报销类型管理）+ 待审核列表
- 普通用户：本月报销记录列表（最近 5 条）

### 填写报销单页面

- 固定字段：申请人（自动填充当前用户真实姓名）、报销日期、费用类型
- 动态字段：根据所选报销类型的 `fields` 配置动态渲染（支持 text / number / date / select / textarea）
- 附件上传：提交时先调用 `/api/v1/file/upload` 上传文件（FormData，type 为 attachment），将返回的 `id` 存入 `attachments`
- 提交时从动态字段中提取 label 为"总价"的字段值作为 `amount` 传递
- 不传递 `applicant_name` 字段

### 报销记录页面

- 表格字段：申请人（管理员可见）、费用类型、申请日期、总价（从 `detail` 数组中取 label 为"总价"的值）、超额（基于 `is_over_limit` 字段显示正常/超额 Tag）、附件、状态、驳回原因
- 驳回原因超过 20 字截断显示，点击弹窗查看完整内容
- 筛选条件：费用类型、状态、申请人（管理员）、最小/最大总价（前端过滤）、日期范围
- 管理员操作：通过、驳回（填写驳回原因）、撤回
- 普通用户操作：撤回、查看详情
- 详情弹窗：展示基础信息、超额情况、审批信息、附件链接、报销明细
- 移动端卡片列表适配
- 导出 Excel：仅导出已通过（approved）的记录，前端双重过滤保障

### 异常记录页面（管理员）

- 展示 `is_over_limit` 为 true 的报销记录
- 支持按费用类型、状态筛选
- 显示异常类型、异常说明、总价、状态
- 点击查看详情弹窗

### 报销类型管理页面（管理员）

- 新建报销类型：类型标识符（英文）、类型名称、备注、状态、字段配置
- 字段配置支持：字段标识符、字段名称、字段类型（text/number/date/select/textarea）、必填、排序
- select 类型支持配置选项（label + value）
- 已有类型列表：查看详情、修改、删除
- 修改弹窗：支持拖拽排序字段（@dnd-kit），拖拽后自动更新 sort 值
- 调用 PUT `/api/v1/reimbursement/type/:id` 保存修改

### Excel 导出

- 使用 xlsx-js-style 生成带样式的 Excel
- 表头黄色背景、加粗、14 号字体、居中
- 数据行 12 号字体、居中、边框
- 共计行红色字体、加粗
- 按报销类型分 Sheet，全部导出时额外生成总费用汇总 Sheet
- 仅导出已通过的报销记录

### API 层

- `src/api/http.ts`：axios 实例，统一拦截
- `src/api/user.ts`：登录、注册
- `src/api/reimbursement.ts`：报销记录 CRUD、审批、撤回、搜索
- `src/api/reimbursementType.ts`：报销类型增删改查
- `src/api/file.ts`：文件上传（FormData）

### 工程配置

- `.gitignore` 添加 `.env` 忽略
- 提供 `.env.example` 环境变量模板
- Vite 配置 `host: 0.0.0.0` 支持局域网访问
- 全局 CSS 适配移动端 Ant Design 日期选择器（面板垂直排列、触摸区域增大）

# 部门管理、员工管理、审批流 设计文档

## 概述

新增三个核心功能模块：
1. 部门管理 —— 扁平结构，支持增删改查
2. 员工管理 —— 独立花名册，不关联系统登录账号
3. 审批流管理 —— 为报销类型配置可拖拽的审批流，支持会签/或签，含快照功能

同时将 `reimbursements` 集合重命名为 `reimbursement_record`。

---

## 一、命名规范

- 所有字段名：snake_case（如 `employee_no`、`sign_type`）
- 集合名：snake_case（如 `department`、`employee`、`approval_flow`）
- 嵌套文档内的字段同样使用 snake_case

---

## 二、数据模型

### 2.1 Department 部门表

集合名：`department`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string, unique | 是 | 部门名称 |
| code | string, unique | 是 | 部门编码 |
| manager_id | ObjectId ref employee | 否 | 部门负责人 |
| description | string | 否 | 描述 |
| status | number (0/1) | 是 | 0=停用, 1=启用 |
| sort | number | 否 | 排序权重，默认 0 |

timestamps: true（自动 created_at / updated_at）

### 2.2 Employee 员工表

集合名：`employee`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| employee_no | string, unique | 是 | 工号 |
| name | string | 是 | 姓名 |
| gender | number (0/1/2) | 是 | 0=未知, 1=男, 2=女 |
| dept_id | ObjectId ref department | 否 | 所属部门 |
| position | string | 否 | 职位 |
| phone | string | 否 | 手机号 |
| avatar | string | 否 | 头像 URL |
| status | number (0/1) | 是 | 0=离职, 1=在职 |

timestamps: true

### 2.3 ApprovalFlow 审批流表

集合名：`approval_flow`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 审批流名称 |
| type_code | string, unique | 是 | 关联报销类型编码 |
| enabled | boolean | 是 | 是否启用，默认 false |
| nodes | ApprovalNode[] | 是 | 审批节点列表（有序） |
| created_by | ObjectId ref user | 否 | 创建人 |

timestamps: true

#### ApprovalNode（嵌套文档）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| node_id | string | 是 | 唯一标识（前端生成） |
| name | string | 是 | 节点名称（如"部门经理审批"） |
| approver_id | ObjectId ref employee | 是 | 审批人 |
| sign_type | string | 是 | countersign=会签, orsign=或签 |
| sort | number | 是 | 排序 |

### 2.4 ApprovalRecord 审批记录表

集合名：`approval_record`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| record_id | ObjectId ref reimbursement_record | 是 | 关联报销单 |
| flow_snapshot | FlowSnapshot | 是 | 提交时的审批流快照 |
| cur_node_idx | number | 是 | 当前节点索引，从 0 开始 |
| status | string | 是 | pending / approved / rejected |
| actions | Action[] | 是 | 各节点审批动作记录 |

timestamps: true

#### FlowSnapshot（嵌套文档，不包含任何 ObjectId 引用）

| 字段 | 类型 | 说明 |
|------|------|------|
| name | string | 审批流名称 |
| nodes | SnapshotNode[] | 节点快照列表 |

#### SnapshotNode（嵌套文档）

| 字段 | 类型 | 说明 |
|------|------|------|
| node_id | string | 节点标识 |
| name | string | 节点名称 |
| sign_type | string | countersign / orsign |
| approver | ApproverInfo | 审批人信息（拍平） |

#### ApproverInfo（嵌套文档）

| 字段 | 类型 | 说明 |
|------|------|------|
| name | string | 审批人姓名 |
| avatar | string | 头像 |
| dept_name | string | 部门名称 |
| position | string | 职位 |

#### Action（嵌套文档）

| 字段 | 类型 | 说明 |
|------|------|------|
| node_id | string | 对应节点 ID |
| approver_name | string | 审批人姓名 |
| action | string | approve / reject |
| comment | string | 审批意见 |
| acted_at | Date | 操作时间 |

### 2.5 reimbursement_record（原 reimbursements 重命名）

集合名由 `reimbursements_records` 改为 `reimbursement_record`，字段不变。

---

## 三、后端 API

### 3.1 部门 `/api/departments`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | / | 列表（支持 status 筛选） |
| POST | / | 创建 |
| PUT | /:id | 更新 |
| DELETE | /:id | 删除 |

### 3.2 员工 `/api/employees`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | / | 列表（分页、name 搜索、dept_id 筛选） |
| POST | / | 创建 |
| PUT | /:id | 更新 |
| DELETE | /:id | 删除 |

### 3.3 审批流 `/api/approval-flows`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | / | 列表 |
| GET | /:id | 详情 |
| POST | / | 创建（含 nodes） |
| PUT | /:id | 更新（含 nodes） |
| PATCH | /:id/toggle | 开启/关闭（仅管理员） |
| DELETE | /:id | 删除 |

### 3.4 审批操作 `/api/approvals`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /mine | 我的待审批列表 |
| POST | /:id/approve | 通过 |
| POST | /:id/reject | 驳回 |

---

## 四、前端页面

### 4.1 部门管理 DepartmentManage

- 表格展示：名称、编码、负责人、描述、状态（Switch）、操作
- 新增/编辑用 Modal 弹窗
- 负责人字段：下拉搜索员工

### 4.2 员工管理 EmployeeManage

- 顶部：姓名搜索 + 部门筛选下拉 + 新增按钮
- 表格：工号、姓名、性别、部门、职位、手机、状态、操作
- 新增/编辑用 Modal 弹窗，部门从接口动态获取

### 4.3 审批流管理 ApprovalFlowManage

布局：左侧报销类型列表 + 右侧流程编排区

**左侧**：
- 列出所有报销类型
- 每个类型显示是否已绑定审批流、是否启用
- 点击类型进入右侧编排

**右侧（拖拽编排区）**：
- 使用 @dnd-kit 实现节点拖拽排序
- 每个节点卡片显示：头像、姓名、部门、职位、会签/或签标签
- 可添加节点（弹出员工搜索选择）、删除节点、拖拽调整顺序
- 顶部：审批流名称输入 + 启用/关闭 Switch（仅管理员可见）
- 底部：保存按钮

### 4.4 审批记录页面

- 我的待审批列表
- 审批详情页：显示快照中的节点流程图，当前节点高亮，已审批节点显示操作结果

---

## 五、审批流转逻辑

1. 用户提交报销单
2. 查找该报销类型关联的审批流
3. 如果未找到或未启用 → 直接通过
4. 如果已启用：
   - 创建 ApprovalRecord，将审批流完整快照存入 flow_snapshot
   - cur_node_idx = 0，status = pending
   - 通知第一个节点的审批人
5. 审批人操作：
   - **或签（orsign）**：一人通过 → cur_node_idx + 1，进入下一节点
   - **会签（countersign）**：当前节点所有审批人都通过 → cur_node_idx + 1
6. 所有节点通过 → status = approved，报销单状态变为已通过
7. 任一节点驳回 → status = rejected，报销单状态变为已驳回

---

## 六、需要修改的现有代码

### reimbursement 集合重命名

需要修改的文件：
- `src/schemas/reimbursement.schema.ts` — collection 名改为 `reimbursement_record`
- `src/modules/reimbursement/reimbursement.service.ts` — 所有查询逻辑
- `src/modules/reimbursement/reimbursement.controller.ts`
- `src/modules/reimbursement/reimbursement.module.ts`
- `src/modules/reimbursement/dto/*.dto.ts`
- `src/schemas/approval-log.schema.ts` — reimbursement 引用
- `src/modules/ai/ai.service.ts` — 如有引用

### 注册页面联动

- `RegisterPage.tsx` 硬编码的部门列表改为从 `/api/departments` 动态获取

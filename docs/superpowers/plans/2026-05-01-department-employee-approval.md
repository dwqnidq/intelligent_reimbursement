# 部门管理、员工管理、审批流 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增部门管理、员工管理、审批流配置三个模块，支持审批流的拖拽编排和动态流转。

**Architecture:** 后端基于 NestJS + Mongoose，遵循现有模块结构（schema → module → service → controller → DTO）。前端基于 React + Ant Design + @dnd-kit，页面通过 componentMap 动态注册。审批流快照机制确保审批记录不依赖后续数据变更。

**Tech Stack:** NestJS, Mongoose, React 18, Ant Design, @dnd-kit, Zustand, React Router v6

---

## File Structure

### 后端新增文件

| 文件 | 职责 |
|------|------|
| `src/schemas/department.schema.ts` | Department 集合 schema |
| `src/schemas/employee.schema.ts` | Employee 集合 schema |
| `src/schemas/approval-flow.schema.ts` | ApprovalFlow 集合 schema（含嵌套 ApprovalNode） |
| `src/schemas/approval-record.schema.ts` | ApprovalRecord 集合 schema（含 FlowSnapshot 嵌套） |
| `src/modules/department/department.module.ts` | Department 模块注册 |
| `src/modules/department/department.service.ts` | Department CRUD |
| `src/modules/department/department.controller.ts` | Department REST API |
| `src/modules/department/dto/create-department.dto.ts` | 创建 DTO |
| `src/modules/department/dto/update-department.dto.ts` | 更新 DTO |
| `src/modules/employee/employee.module.ts` | Employee 模块注册 |
| `src/modules/employee/employee.service.ts` | Employee CRUD（分页、搜索） |
| `src/modules/employee/employee.controller.ts` | Employee REST API |
| `src/modules/employee/dto/create-employee.dto.ts` | 创建 DTO |
| `src/modules/employee/dto/update-employee.dto.ts` | 更新 DTO |
| `src/modules/approval-flow/approval-flow.module.ts` | ApprovalFlow 模块注册 |
| `src/modules/approval-flow/approval-flow.service.ts` | 审批流 CRUD + toggle |
| `src/modules/approval-flow/approval-flow.controller.ts` | 审批流 REST API |
| `src/modules/approval-flow/dto/create-approval-flow.dto.ts` | 创建 DTO |
| `src/modules/approval-flow/dto/update-approval-flow.dto.ts` | 更新 DTO |
| `src/modules/approval-record/approval-record.module.ts` | ApprovalRecord 模块注册 |
| `src/modules/approval-record/approval-record.service.ts` | 审批记录 + 流转逻辑 |
| `src/modules/approval-record/approval-record.controller.ts` | 审批操作 API |

### 后端修改文件

| 文件 | 改动 |
|------|------|
| `src/schemas/reimbursement.schema.ts` | collection 改为 `reimbursement_record` |
| `src/app.module.ts` | 注册 4 个新模块 |

### 前端新增文件

| 文件 | 职责 |
|------|------|
| `src/api/department.ts` | 部门 API 封装 |
| `src/api/employee.ts` | 员工 API 封装 |
| `src/api/approvalFlow.ts` | 审批流 API 封装 |
| `src/api/approvalRecord.ts` | 审批记录 API 封装 |
| `src/pages/DepartmentManage.tsx` | 部门管理页面 |
| `src/pages/EmployeeManage.tsx` | 员工管理页面 |
| `src/pages/ApprovalFlowManage.tsx` | 审批流拖拽编排页面 |

### 前端修改文件

| 文件 | 改动 |
|------|------|
| `src/router/componentMap.tsx` | 注册 3 个新页面组件 |
| `src/router/iconMap.tsx` | 添加新图标映射 |
| `src/pages/RegisterPage.tsx` | 部门列表改为动态获取 |

---

## Task 1: Rename reimbursement collection

**Files:**
- Modify: `intelligent_reimbursement_system_server/src/schemas/reimbursement.schema.ts:4`

- [ ] **Step 1: 修改 schema 中的 collection 名**

```typescript
// intelligent_reimbursement_system_server/src/schemas/reimbursement.schema.ts:4
// 将 collection: 'reimbursements_records' 改为 collection: 'reimbursement_record'
@Schema({ timestamps: true, collection: 'reimbursement_record' })
```

- [ ] **Step 2: 检查 MongoDB 中是否需要重命名集合**

如果 MongoDB 中已有 `reimbursements_records` 集合且有数据，需要在 MongoDB shell 中执行：
```javascript
db.reimbursements_records.renameCollection("reimbursement_record")
```
如果是全新环境则跳过此步。

- [ ] **Step 3: 验证后端启动无报错**

```bash
cd intelligent_reimbursement_system_server
npm run start:dev
```
Expected: 服务正常启动，无 schema 注册错误

---

## Task 2: Department 后端模块

**Files:**
- Create: `intelligent_reimbursement_system_server/src/schemas/department.schema.ts`
- Create: `intelligent_reimbursement_system_server/src/modules/department/dto/create-department.dto.ts`
- Create: `intelligent_reimbursement_system_server/src/modules/department/dto/update-department.dto.ts`
- Create: `intelligent_reimbursement_system_server/src/modules/department/department.service.ts`
- Create: `intelligent_reimbursement_system_server/src/modules/department/department.controller.ts`
- Create: `intelligent_reimbursement_system_server/src/modules/department/department.module.ts`
- Modify: `intelligent_reimbursement_system_server/src/app.module.ts`

- [ ] **Step 1: 创建 Department schema**

```typescript
// intelligent_reimbursement_system_server/src/schemas/department.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'department' })
export class Department extends Document {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop({ required: true, unique: true })
  code: string;

  @Prop({ type: Types.ObjectId, ref: 'Employee' })
  manager_id: Types.ObjectId;

  @Prop()
  description: string;

  @Prop({ required: true, default: 1, enum: [0, 1] })
  status: number;

  @Prop({ default: 0 })
  sort: number;
}

export const DepartmentSchema = SchemaFactory.createForClass(Department);
```

- [ ] **Step 2: 创建 DTOs**

```typescript
// intelligent_reimbursement_system_server/src/modules/department/dto/create-department.dto.ts
import { IsString, IsOptional, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDepartmentDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  code: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  manager_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  status?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  sort?: number;
}
```

```typescript
// intelligent_reimbursement_system_server/src/modules/department/dto/update-department.dto.ts
import { PartialType } from '@nestjs/swagger';
import { CreateDepartmentDto } from './create-department.dto';

export class UpdateDepartmentDto extends PartialType(CreateDepartmentDto) {}
```

- [ ] **Step 3: 创建 DepartmentService**

```typescript
// intelligent_reimbursement_system_server/src/modules/department/department.service.ts
import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Department } from '../../schemas/department.schema';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

@Injectable()
export class DepartmentService {
  constructor(
    @InjectModel(Department.name)
    private deptModel: Model<Department>,
  ) {}

  async findAll(query?: { status?: number }) {
    const filter: Record<string, unknown> = {};
    if (query?.status !== undefined) filter.status = query.status;
    return this.deptModel
      .find(filter)
      .populate('manager_id', 'name avatar position')
      .sort({ sort: 1, createdAt: 1 });
  }

  async create(dto: CreateDepartmentDto) {
    const exists = await this.deptModel.findOne({
      $or: [{ name: dto.name }, { code: dto.code }],
    });
    if (exists) {
      if (exists.name === dto.name) throw new ConflictException('部门名称已存在');
      throw new ConflictException('部门编码已存在');
    }
    const doc = await this.deptModel.create(dto);
    return { id: doc._id };
  }

  async update(id: string, dto: UpdateDepartmentDto) {
    const record = await this.deptModel.findById(id);
    if (!record) throw new NotFoundException('部门不存在');

    if (dto.name || dto.code) {
      const query: Record<string, unknown> = { _id: { $ne: id } };
      const or: Record<string, unknown>[] = [];
      if (dto.name) or.push({ name: dto.name });
      if (dto.code) or.push({ code: dto.code });
      if (or.length) {
        query.$or = or;
        const exists = await this.deptModel.findOne(query);
        if (exists) {
          if (exists.name === dto.name) throw new ConflictException('部门名称已存在');
          throw new ConflictException('部门编码已存在');
        }
      }
    }

    Object.assign(record, dto);
    await record.save();
    return { id: record._id };
  }

  async remove(id: string) {
    const record = await this.deptModel.findById(id);
    if (!record) throw new NotFoundException('部门不存在');
    await this.deptModel.deleteOne({ _id: id });
    return { id };
  }
}
```

- [ ] **Step 4: 创建 DepartmentController**

```typescript
// intelligent_reimbursement_system_server/src/modules/department/department.controller.ts
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { DepartmentService } from './department.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('Departments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('departments')
export class DepartmentController {
  constructor(private readonly service: DepartmentService) {}

  @ApiOperation({ summary: '获取部门列表' })
  @Get()
  findAll(@Query('status') status?: string) {
    const query = status !== undefined ? { status: Number(status) } : undefined;
    return this.service.findAll(query);
  }

  @ApiOperation({ summary: '创建部门' })
  @Post()
  create(@Body() dto: CreateDepartmentDto) {
    return this.service.create(dto);
  }

  @ApiOperation({ summary: '更新部门' })
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDepartmentDto) {
    return this.service.update(id, dto);
  }

  @ApiOperation({ summary: '删除部门' })
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
```

- [ ] **Step 5: 创建 DepartmentModule**

```typescript
// intelligent_reimbursement_system_server/src/modules/department/department.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DepartmentController } from './department.controller';
import { DepartmentService } from './department.service';
import { Department, DepartmentSchema } from '../../schemas/department.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Department.name, schema: DepartmentSchema },
    ]),
  ],
  controllers: [DepartmentController],
  providers: [DepartmentService],
  exports: [DepartmentService],
})
export class DepartmentModule {}
```

- [ ] **Step 6: 注册到 AppModule**

在 `intelligent_reimbursement_system_server/src/app.module.ts` 的 imports 数组中添加：
```typescript
import { DepartmentModule } from './modules/department/department.module';
// 在 imports 数组中添加 DepartmentModule
```

- [ ] **Step 7: 验证部门 API**

```bash
cd intelligent_reimbursement_system_server
npm run start:dev
# 用 curl 或 Postman 测试 POST /api/departments 和 GET /api/departments
```

---

## Task 3: Employee 后端模块

**Files:**
- Create: `intelligent_reimbursement_system_server/src/schemas/employee.schema.ts`
- Create: `intelligent_reimbursement_system_server/src/modules/employee/dto/create-employee.dto.ts`
- Create: `intelligent_reimbursement_system_server/src/modules/employee/dto/update-employee.dto.ts`
- Create: `intelligent_reimbursement_system_server/src/modules/employee/employee.service.ts`
- Create: `intelligent_reimbursement_system_server/src/modules/employee/employee.controller.ts`
- Create: `intelligent_reimbursement_system_server/src/modules/employee/employee.module.ts`
- Modify: `intelligent_reimbursement_system_server/src/app.module.ts`

- [ ] **Step 1: 创建 Employee schema**

```typescript
// intelligent_reimbursement_system_server/src/schemas/employee.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'employee' })
export class Employee extends Document {
  @Prop({ required: true, unique: true })
  employee_no: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, default: 0, enum: [0, 1, 2] })
  gender: number;

  @Prop({ type: Types.ObjectId, ref: 'Department' })
  dept_id: Types.ObjectId;

  @Prop()
  position: string;

  @Prop()
  phone: string;

  @Prop()
  avatar: string;

  @Prop({ required: true, default: 1, enum: [0, 1] })
  status: number;
}

export const EmployeeSchema = SchemaFactory.createForClass(Employee);
```

- [ ] **Step 2: 创建 DTOs**

```typescript
// intelligent_reimbursement_system_server/src/modules/employee/dto/create-employee.dto.ts
import { IsString, IsOptional, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateEmployeeDto {
  @ApiProperty()
  @IsString()
  employee_no: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsNumber()
  gender: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dept_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  position?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  avatar?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  status?: number;
}
```

```typescript
// intelligent_reimbursement_system_server/src/modules/employee/dto/update-employee.dto.ts
import { PartialType } from '@nestjs/swagger';
import { CreateEmployeeDto } from './create-employee.dto';

export class UpdateEmployeeDto extends PartialType(CreateEmployeeDto) {}
```

- [ ] **Step 3: 创建 EmployeeService**

```typescript
// intelligent_reimbursement_system_server/src/modules/employee/employee.service.ts
import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Employee } from '../../schemas/employee.schema';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

@Injectable()
export class EmployeeService {
  constructor(
    @InjectModel(Employee.name)
    private empModel: Model<Employee>,
  ) {}

  async findAll(query?: { name?: string; dept_id?: string; page?: number; page_size?: number }) {
    const filter: Record<string, unknown> = {};
    if (query?.name) filter.name = { $regex: query.name, $options: 'i' };
    if (query?.dept_id) filter.dept_id = query.dept_id;

    const page = query?.page || 1;
    const pageSize = query?.page_size || 20;

    const [list, total] = await Promise.all([
      this.empModel
        .find(filter)
        .populate('dept_id', 'name code')
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize),
      this.empModel.countDocuments(filter),
    ]);

    return { list, total, page, page_size: pageSize };
  }

  async create(dto: CreateEmployeeDto) {
    const exists = await this.empModel.findOne({ employee_no: dto.employee_no });
    if (exists) throw new ConflictException('工号已存在');
    const doc = await this.empModel.create(dto);
    return { id: doc._id };
  }

  async update(id: string, dto: UpdateEmployeeDto) {
    const record = await this.empModel.findById(id);
    if (!record) throw new NotFoundException('员工不存在');

    if (dto.employee_no && dto.employee_no !== record.employee_no) {
      const dup = await this.empModel.findOne({ employee_no: dto.employee_no });
      if (dup) throw new ConflictException('工号已存在');
    }

    Object.assign(record, dto);
    await record.save();
    return { id: record._id };
  }

  async remove(id: string) {
    const record = await this.empModel.findById(id);
    if (!record) throw new NotFoundException('员工不存在');
    await this.empModel.deleteOne({ _id: id });
    return { id };
  }
}
```

- [ ] **Step 4: 创建 EmployeeController**

```typescript
// intelligent_reimbursement_system_server/src/modules/employee/employee.controller.ts
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { EmployeeService } from './employee.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('Employees')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('employees')
export class EmployeeController {
  constructor(private readonly service: EmployeeService) {}

  @ApiOperation({ summary: '获取员工列表（分页、搜索、部门筛选）' })
  @Get()
  findAll(
    @Query('name') name?: string,
    @Query('dept_id') dept_id?: string,
    @Query('page') page?: string,
    @Query('page_size') page_size?: string,
  ) {
    return this.service.findAll({
      name,
      dept_id,
      page: page ? Number(page) : undefined,
      page_size: page_size ? Number(page_size) : undefined,
    });
  }

  @ApiOperation({ summary: '创建员工' })
  @Post()
  create(@Body() dto: CreateEmployeeDto) {
    return this.service.create(dto);
  }

  @ApiOperation({ summary: '更新员工' })
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
    return this.service.update(id, dto);
  }

  @ApiOperation({ summary: '删除员工' })
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
```

- [ ] **Step 5: 创建 EmployeeModule 并注册到 AppModule**

```typescript
// intelligent_reimbursement_system_server/src/modules/employee/employee.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EmployeeController } from './employee.controller';
import { EmployeeService } from './employee.service';
import { Employee, EmployeeSchema } from '../../schemas/employee.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Employee.name, schema: EmployeeSchema },
    ]),
  ],
  controllers: [EmployeeController],
  providers: [EmployeeService],
  exports: [EmployeeService],
})
export class EmployeeModule {}
```

在 `app.module.ts` imports 中添加 `EmployeeModule`。

---

## Task 4: ApprovalFlow 后端模块

**Files:**
- Create: `intelligent_reimbursement_system_server/src/schemas/approval-flow.schema.ts`
- Create: `intelligent_reimbursement_system_server/src/modules/approval-flow/dto/create-approval-flow.dto.ts`
- Create: `intelligent_reimbursement_system_server/src/modules/approval-flow/dto/update-approval-flow.dto.ts`
- Create: `intelligent_reimbursement_system_server/src/modules/approval-flow/approval-flow.service.ts`
- Create: `intelligent_reimbursement_system_server/src/modules/approval-flow/approval-flow.controller.ts`
- Create: `intelligent_reimbursement_system_server/src/modules/approval-flow/approval-flow.module.ts`
- Modify: `intelligent_reimbursement_system_server/src/app.module.ts`

- [ ] **Step 1: 创建 ApprovalFlow schema**

```typescript
// intelligent_reimbursement_system_server/src/schemas/approval-flow.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ _id: false })
export class ApprovalNode {
  @Prop({ required: true })
  node_id: string;

  @Prop({ required: true })
  name: string;

  @Prop({ type: Types.ObjectId, ref: 'Employee', required: true })
  approver_id: Types.ObjectId;

  @Prop({ required: true, enum: ['countersign', 'orsign'] })
  sign_type: string;

  @Prop({ required: true })
  sort: number;
}

export const ApprovalNodeSchema = SchemaFactory.createForClass(ApprovalNode);

@Schema({ timestamps: true, collection: 'approval_flow' })
export class ApprovalFlow extends Document {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  type_code: string;

  @Prop({ required: true, default: false })
  enabled: boolean;

  @Prop({ type: [ApprovalNodeSchema], default: [] })
  nodes: ApprovalNode[];

  @Prop({ type: Types.ObjectId, ref: 'User' })
  created_by: Types.ObjectId;
}

export const ApprovalFlowSchema = SchemaFactory.createForClass(ApprovalFlow);
```

- [ ] **Step 2: 创建 DTOs**

```typescript
// intelligent_reimbursement_system_server/src/modules/approval-flow/dto/create-approval-flow.dto.ts
import { IsString, IsBoolean, IsArray, ValidateNested, IsNumber, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class ApprovalNodeDto {
  @ApiProperty()
  @IsString()
  node_id: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  approver_id: string;

  @ApiProperty({ enum: ['countersign', 'orsign'] })
  @IsString()
  sign_type: string;

  @ApiProperty()
  @IsNumber()
  sort: number;
}

export class CreateApprovalFlowDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  type_code: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiProperty({ type: [ApprovalNodeDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ApprovalNodeDto)
  nodes: ApprovalNodeDto[];
}
```

```typescript
// intelligent_reimbursement_system_server/src/modules/approval-flow/dto/update-approval-flow.dto.ts
import { PartialType } from '@nestjs/swagger';
import { CreateApprovalFlowDto } from './create-approval-flow.dto';

export class UpdateApprovalFlowDto extends PartialType(CreateApprovalFlowDto) {}
```

- [ ] **Step 3: 创建 ApprovalFlowService**

```typescript
// intelligent_reimbursement_system_server/src/modules/approval-flow/approval-flow.service.ts
import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ApprovalFlow } from '../../schemas/approval-flow.schema';
import { CreateApprovalFlowDto } from './dto/create-approval-flow.dto';
import { UpdateApprovalFlowDto } from './dto/update-approval-flow.dto';

@Injectable()
export class ApprovalFlowService {
  constructor(
    @InjectModel(ApprovalFlow.name)
    private flowModel: Model<ApprovalFlow>,
  ) {}

  async findAll() {
    return this.flowModel
      .find()
      .populate('nodes.approver_id', 'name avatar position dept_id')
      .populate('created_by', 'real_name')
      .sort({ createdAt: -1 });
  }

  async findOne(id: string) {
    const record = await this.flowModel
      .findById(id)
      .populate('nodes.approver_id', 'name avatar position dept_id');
    if (!record) throw new NotFoundException('审批流不存在');
    return record;
  }

  async create(dto: CreateApprovalFlowDto, userId: string) {
    const exists = await this.flowModel.findOne({ type_code: dto.type_code });
    if (exists) throw new ConflictException('该报销类型已绑定审批流');
    const doc = await this.flowModel.create({ ...dto, created_by: userId });
    return { id: doc._id };
  }

  async update(id: string, dto: UpdateApprovalFlowDto) {
    const record = await this.flowModel.findById(id);
    if (!record) throw new NotFoundException('审批流不存在');

    if (dto.type_code && dto.type_code !== record.type_code) {
      const dup = await this.flowModel.findOne({ type_code: dto.type_code });
      if (dup) throw new ConflictException('该报销类型已绑定审批流');
    }

    Object.assign(record, dto);
    await record.save();
    return { id: record._id };
  }

  async toggle(id: string) {
    const record = await this.flowModel.findById(id);
    if (!record) throw new NotFoundException('审批流不存在');
    record.enabled = !record.enabled;
    await record.save();
    return { id: record._id, enabled: record.enabled };
  }

  async remove(id: string) {
    const record = await this.flowModel.findById(id);
    if (!record) throw new NotFoundException('审批流不存在');
    await this.flowModel.deleteOne({ _id: id });
    return { id };
  }

  async findByTypeCode(typeCode: string) {
    return this.flowModel.findOne({ type_code: typeCode, enabled: true });
  }
}
```

- [ ] **Step 4: 创建 ApprovalFlowController**

```typescript
// intelligent_reimbursement_system_server/src/modules/approval-flow/approval-flow.controller.ts
import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { ApprovalFlowService } from './approval-flow.service';
import { CreateApprovalFlowDto } from './dto/create-approval-flow.dto';
import { UpdateApprovalFlowDto } from './dto/update-approval-flow.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@ApiTags('ApprovalFlows')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('approval-flows')
export class ApprovalFlowController {
  constructor(private readonly service: ApprovalFlowService) {}

  @ApiOperation({ summary: '获取审批流列表' })
  @Get()
  findAll() {
    return this.service.findAll();
  }

  @ApiOperation({ summary: '获取审批流详情' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @ApiOperation({ summary: '创建审批流' })
  @Post()
  create(@Body() dto: CreateApprovalFlowDto, @CurrentUser('id') userId: string) {
    return this.service.create(dto, userId);
  }

  @ApiOperation({ summary: '更新审批流' })
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateApprovalFlowDto) {
    return this.service.update(id, dto);
  }

  @ApiOperation({ summary: '开启/关闭审批流' })
  @Patch(':id/toggle')
  toggle(@Param('id') id: string) {
    return this.service.toggle(id);
  }

  @ApiOperation({ summary: '删除审批流' })
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
```

- [ ] **Step 5: 创建 ApprovalFlowModule 并注册到 AppModule**

```typescript
// intelligent_reimbursement_system_server/src/modules/approval-flow/approval-flow.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ApprovalFlowController } from './approval-flow.controller';
import { ApprovalFlowService } from './approval-flow.service';
import { ApprovalFlow, ApprovalFlowSchema } from '../../schemas/approval-flow.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ApprovalFlow.name, schema: ApprovalFlowSchema },
    ]),
  ],
  controllers: [ApprovalFlowController],
  providers: [ApprovalFlowService],
  exports: [ApprovalFlowService],
})
export class ApprovalFlowModule {}
```

在 `app.module.ts` imports 中添加 `ApprovalFlowModule`。

---

## Task 5: ApprovalRecord 后端模块（审批流转逻辑）

**Files:**
- Create: `intelligent_reimbursement_system_server/src/schemas/approval-record.schema.ts`
- Create: `intelligent_reimbursement_system_server/src/modules/approval-record/approval-record.service.ts`
- Create: `intelligent_reimbursement_system_server/src/modules/approval-record/approval-record.controller.ts`
- Create: `intelligent_reimbursement_system_server/src/modules/approval-record/approval-record.module.ts`
- Modify: `intelligent_reimbursement_system_server/src/app.module.ts`

- [ ] **Step 1: 创建 ApprovalRecord schema（含快照嵌套文档）**

```typescript
// intelligent_reimbursement_system_server/src/schemas/approval-record.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ──── 快照内的审批人信息（纯数据，无 ObjectId） ────
@Schema({ _id: false })
export class ApproverInfo {
  @Prop({ required: true })
  name: string;

  @Prop()
  avatar: string;

  @Prop()
  dept_name: string;

  @Prop()
  position: string;
}
export const ApproverInfoSchema = SchemaFactory.createForClass(ApproverInfo);

// ──── 快照内的节点 ────
@Schema({ _id: false })
export class SnapshotNode {
  @Prop({ required: true })
  node_id: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, enum: ['countersign', 'orsign'] })
  sign_type: string;

  @Prop({ type: ApproverInfoSchema, required: true })
  approver: ApproverInfo;
}
export const SnapshotNodeSchema = SchemaFactory.createForClass(SnapshotNode);

// ──── 审批流快照 ────
@Schema({ _id: false })
export class FlowSnapshot {
  @Prop({ required: true })
  name: string;

  @Prop({ type: [SnapshotNodeSchema], required: true })
  nodes: SnapshotNode[];
}
export const FlowSnapshotSchema = SchemaFactory.createForClass(FlowSnapshot);

// ──── 审批动作记录 ────
@Schema({ _id: false })
export class ApprovalAction {
  @Prop({ required: true })
  node_id: string;

  @Prop({ required: true })
  approver_name: string;

  @Prop({ required: true, enum: ['approve', 'reject'] })
  action: string;

  @Prop()
  comment: string;

  @Prop({ required: true })
  acted_at: Date;
}
export const ApprovalActionSchema = SchemaFactory.createForClass(ApprovalAction);

// ──── 主记录 ────
@Schema({ timestamps: true, collection: 'approval_record' })
export class ApprovalRecord extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Reimbursement', required: true })
  record_id: Types.ObjectId;

  @Prop({ type: FlowSnapshotSchema, required: true })
  flow_snapshot: FlowSnapshot;

  @Prop({ required: true, default: 0 })
  cur_node_idx: number;

  @Prop({ required: true, default: 'pending', enum: ['pending', 'approved', 'rejected'] })
  status: string;

  @Prop({ type: [ApprovalActionSchema], default: [] })
  actions: ApprovalAction[];
}

export const ApprovalRecordSchema = SchemaFactory.createForClass(ApprovalRecord);
```

- [ ] **Step 2: 创建 ApprovalRecordService（含流转逻辑）**

```typescript
// intelligent_reimbursement_system_server/src/modules/approval-record/approval-record.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ApprovalRecord } from '../../schemas/approval-record.schema';
import { ApprovalFlow } from '../../schemas/approval-flow.schema';
import { Employee } from '../../schemas/employee.schema';
import { Department } from '../../schemas/department.schema';
import { Reimbursement } from '../../schemas/reimbursement.schema';

@Injectable()
export class ApprovalRecordService {
  constructor(
    @InjectModel(ApprovalRecord.name)
    private recordModel: Model<ApprovalRecord>,
    @InjectModel(ApprovalFlow.name)
    private flowModel: Model<ApprovalFlow>,
    @InjectModel(Employee.name)
    private empModel: Model<Employee>,
    @InjectModel(Department.name)
    private deptModel: Model<Department>,
    @InjectModel(Reimbursement.name)
    private reimbursementModel: Model<Reimbursement>,
  ) {}

  // 提交报销单时调用：创建审批记录（含快照）
  async create(reimbursementId: string, typeCode: string) {
    const flow = await this.flowModel
      .findOne({ type_code: typeCode, enabled: true })
      .populate('nodes.approver_id');

    if (!flow) return null; // 无审批流或未启用，直接通过

    // 构建快照：把审批人信息拍平
    const snapshotNodes = [];
    for (const node of flow.nodes) {
      const emp = node.approver_id as unknown as InstanceType<typeof Employee>;
      let deptName = '';
      if (emp.dept_id) {
        const dept = await this.deptModel.findById(emp.dept_id);
        deptName = dept?.name || '';
      }
      snapshotNodes.push({
        node_id: node.node_id,
        name: node.name,
        sign_type: node.sign_type,
        approver: {
          name: emp.name,
          avatar: emp.avatar || '',
          dept_name: deptName,
          position: emp.position || '',
        },
      });
    }

    const record = await this.recordModel.create({
      record_id: new Types.ObjectId(reimbursementId),
      flow_snapshot: {
        name: flow.name,
        nodes: snapshotNodes,
      },
      cur_node_idx: 0,
      status: 'pending',
      actions: [],
    });

    return record;
  }

  // 获取我的待审批列表
  async findMyPending(employeeId: string) {
    const emp = await this.empModel.findById(employeeId);
    if (!emp) throw new NotFoundException('员工不存在');

    return this.recordModel.find({
      status: 'pending',
      'flow_snapshot.nodes': {
        $elemMatch: {
          'approver.name': emp.name,
        },
      },
    });
  }

  // 审批通过
  async approve(recordId: string, employeeId: string, comment?: string) {
    const record = await this.recordModel.findById(recordId);
    if (!record) throw new NotFoundException('审批记录不存在');
    if (record.status !== 'pending') throw new BadRequestException('该审批已结束');

    const emp = await this.empModel.findById(employeeId);
    if (!emp) throw new NotFoundException('员工不存在');

    const curNode = record.flow_snapshot.nodes[record.cur_node_idx];
    if (!curNode) throw new BadRequestException('当前节点不存在');

    // 验证是否是当前节点的审批人
    if (curNode.approver.name !== emp.name) {
      throw new BadRequestException('您不是当前节点的审批人');
    }

    record.actions.push({
      node_id: curNode.node_id,
      approver_name: emp.name,
      action: 'approve',
      comment: comment || '',
      acted_at: new Date(),
    });

    if (curNode.sign_type === 'orsign') {
      // 或签：一人通过即进入下一节点
      record.cur_node_idx += 1;
    } else {
      // 会签：需要所有同节点审批人都通过（简化处理：也进入下一节点）
      record.cur_node_idx += 1;
    }

    // 检查是否所有节点都已审批
    if (record.cur_node_idx >= record.flow_snapshot.nodes.length) {
      record.status = 'approved';
      await this.reimbursementModel.findByIdAndUpdate(record.record_id, {
        status: 'approved',
      });
    }

    await record.save();
    return record;
  }

  // 审批驳回
  async reject(recordId: string, employeeId: string, comment?: string) {
    const record = await this.recordModel.findById(recordId);
    if (!record) throw new NotFoundException('审批记录不存在');
    if (record.status !== 'pending') throw new BadRequestException('该审批已结束');

    const emp = await this.empModel.findById(employeeId);
    if (!emp) throw new NotFoundException('员工不存在');

    const curNode = record.flow_snapshot.nodes[record.cur_node_idx];
    if (curNode.approver.name !== emp.name) {
      throw new BadRequestException('您不是当前节点的审批人');
    }

    record.actions.push({
      node_id: curNode.node_id,
      approver_name: emp.name,
      action: 'reject',
      comment: comment || '',
      acted_at: new Date(),
    });

    record.status = 'rejected';
    await this.reimbursementModel.findByIdAndUpdate(record.record_id, {
      status: 'rejected',
      reject_reason: comment || '审批驳回',
    });

    await record.save();
    return record;
  }
}
```

- [ ] **Step 3: 创建 ApprovalRecordController**

```typescript
// intelligent_reimbursement_system_server/src/modules/approval-record/approval-record.controller.ts
import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { ApprovalRecordService } from './approval-record.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@ApiTags('Approvals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('approvals')
export class ApprovalRecordController {
  constructor(private readonly service: ApprovalRecordService) {}

  @ApiOperation({ summary: '我的待审批列表' })
  @Get('mine')
  findMyPending(@CurrentUser('id') userId: string) {
    return this.service.findMyPending(userId);
  }

  @ApiOperation({ summary: '审批通过' })
  @Post(':id/approve')
  approve(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body('comment') comment?: string,
  ) {
    return this.service.approve(id, userId, comment);
  }

  @ApiOperation({ summary: '审批驳回' })
  @Post(':id/reject')
  reject(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body('comment') comment?: string,
  ) {
    return this.service.reject(id, userId, comment);
  }
}
```

- [ ] **Step 4: 创建 ApprovalRecordModule 并注册到 AppModule**

```typescript
// intelligent_reimbursement_system_server/src/modules/approval-record/approval-record.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ApprovalRecordController } from './approval-record.controller';
import { ApprovalRecordService } from './approval-record.service';
import { ApprovalRecord, ApprovalRecordSchema } from '../../schemas/approval-record.schema';
import { ApprovalFlow, ApprovalFlowSchema } from '../../schemas/approval-flow.schema';
import { Employee, EmployeeSchema } from '../../schemas/employee.schema';
import { Department, DepartmentSchema } from '../../schemas/department.schema';
import { Reimbursement, ReimbursementSchema } from '../../schemas/reimbursement.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ApprovalRecord.name, schema: ApprovalRecordSchema },
      { name: ApprovalFlow.name, schema: ApprovalFlowSchema },
      { name: Employee.name, schema: EmployeeSchema },
      { name: Department.name, schema: DepartmentSchema },
      { name: Reimbursement.name, schema: ReimbursementSchema },
    ]),
  ],
  controllers: [ApprovalRecordController],
  providers: [ApprovalRecordService],
  exports: [ApprovalRecordService],
})
export class ApprovalRecordModule {}
```

在 `app.module.ts` imports 中添加 `ApprovalRecordModule`。

---

## Task 6: 前端 API 层

**Files:**
- Create: `intelligent_reimbursement_system/src/api/department.ts`
- Create: `intelligent_reimbursement_system/src/api/employee.ts`
- Create: `intelligent_reimbursement_system/src/api/approvalFlow.ts`
- Create: `intelligent_reimbursement_system/src/api/approvalRecord.ts`

- [ ] **Step 1: 创建 department.ts**

```typescript
// intelligent_reimbursement_system/src/api/department.ts
import http from "./http";

export interface Department {
  _id: string;
  name: string;
  code: string;
  manager_id?: { _id: string; name: string; avatar: string; position: string };
  description?: string;
  status: number;
  sort: number;
}

export interface CreateDepartmentParams {
  name: string;
  code: string;
  manager_id?: string;
  description?: string;
  status?: number;
  sort?: number;
}

export const getDepartments = (params?: { status?: number }) =>
  http.get<Department[]>("/departments", { params });

export const createDepartment = (params: CreateDepartmentParams) =>
  http.post<{ id: string }>("/departments", params);

export const updateDepartment = (id: string, params: Partial<CreateDepartmentParams>) =>
  http.put<{ id: string }>(`/departments/${id}`, params);

export const deleteDepartment = (id: string) =>
  http.delete<{ id: string }>(`/departments/${id}`);
```

- [ ] **Step 2: 创建 employee.ts**

```typescript
// intelligent_reimbursement_system/src/api/employee.ts
import http from "./http";

export interface Employee {
  _id: string;
  employee_no: string;
  name: string;
  gender: number;
  dept_id?: { _id: string; name: string; code: string };
  position?: string;
  phone?: string;
  avatar?: string;
  status: number;
}

export interface EmployeeListResponse {
  list: Employee[];
  total: number;
  page: number;
  page_size: number;
}

export interface CreateEmployeeParams {
  employee_no: string;
  name: string;
  gender: number;
  dept_id?: string;
  position?: string;
  phone?: string;
  avatar?: string;
  status?: number;
}

export const getEmployees = (params?: {
  name?: string;
  dept_id?: string;
  page?: number;
  page_size?: number;
}) => http.get<EmployeeListResponse>("/employees", { params });

export const createEmployee = (params: CreateEmployeeParams) =>
  http.post<{ id: string }>("/employees", params);

export const updateEmployee = (id: string, params: Partial<CreateEmployeeParams>) =>
  http.put<{ id: string }>(`/employees/${id}`, params);

export const deleteEmployee = (id: string) =>
  http.delete<{ id: string }>(`/employees/${id}`);
```

- [ ] **Step 3: 创建 approvalFlow.ts**

```typescript
// intelligent_reimbursement_system/src/api/approvalFlow.ts
import http from "./http";

export interface ApprovalNodeData {
  node_id: string;
  name: string;
  approver_id: string;
  sign_type: "countersign" | "orsign";
  sort: number;
}

export interface ApprovalFlow {
  _id: string;
  name: string;
  type_code: string;
  enabled: boolean;
  nodes: (ApprovalNodeData & {
    approver_id: {
      _id: string;
      name: string;
      avatar: string;
      position: string;
      dept_id: { _id: string; name: string };
    };
  })[];
  created_by?: { _id: string; real_name: string };
}

export interface CreateApprovalFlowParams {
  name: string;
  type_code: string;
  enabled?: boolean;
  nodes: ApprovalNodeData[];
}

export const getApprovalFlows = () =>
  http.get<ApprovalFlow[]>("/approval-flows");

export const getApprovalFlow = (id: string) =>
  http.get<ApprovalFlow>(`/approval-flows/${id}`);

export const createApprovalFlow = (params: CreateApprovalFlowParams) =>
  http.post<{ id: string }>("/approval-flows", params);

export const updateApprovalFlow = (
  id: string,
  params: Partial<CreateApprovalFlowParams>,
) => http.put<{ id: string }>(`/approval-flows/${id}`, params);

export const toggleApprovalFlow = (id: string) =>
  http.patch<{ id: string; enabled: boolean }>(`/approval-flows/${id}/toggle`);

export const deleteApprovalFlow = (id: string) =>
  http.delete<{ id: string }>(`/approval-flows/${id}`);
```

- [ ] **Step 4: 创建 approvalRecord.ts**

```typescript
// intelligent_reimbursement_system/src/api/approvalRecord.ts
import http from "./http";

export interface ApproverInfo {
  name: string;
  avatar: string;
  dept_name: string;
  position: string;
}

export interface SnapshotNode {
  node_id: string;
  name: string;
  sign_type: "countersign" | "orsign";
  approver: ApproverInfo;
}

export interface ApprovalAction {
  node_id: string;
  approver_name: string;
  action: "approve" | "reject";
  comment: string;
  acted_at: string;
}

export interface ApprovalRecordItem {
  _id: string;
  record_id: string;
  flow_snapshot: {
    name: string;
    nodes: SnapshotNode[];
  };
  cur_node_idx: number;
  status: "pending" | "approved" | "rejected";
  actions: ApprovalAction[];
}

export const getMyPendingApprovals = () =>
  http.get<ApprovalRecordItem[]>("/approvals/mine");

export const approveRecord = (id: string, comment?: string) =>
  http.post<ApprovalRecordItem>(`/approvals/${id}/approve`, { comment });

export const rejectRecord = (id: string, comment?: string) =>
  http.post<ApprovalRecordItem>(`/approvals/${id}/reject`, { comment });
```

---

## Task 7: 部门管理前端页面

**Files:**
- Create: `intelligent_reimbursement_system/src/pages/DepartmentManage.tsx`
- Modify: `intelligent_reimbursement_system/src/router/componentMap.tsx`
- Modify: `intelligent_reimbursement_system/src/router/iconMap.tsx`

- [ ] **Step 1: 创建 DepartmentManage 页面**

```tsx
// intelligent_reimbursement_system/src/pages/DepartmentManage.tsx
// 遵循 ReimbursementTypeCreate.tsx 的样式模式
// 使用 Card + Table + Modal + Form (Ant Design)
// 表格列：名称、编码、负责人、描述、状态(Switch)、操作(编辑/删除)
// 新增/编辑 Modal：Form.Item 包含 name, code, manager_id(Select搜索员工), description, status, sort
// 负责人字段使用 Select + showSearch，从 /api/employees 搜索
```

核心结构：
- `useState` 管理 `deptList`, `loading`, `editDept`, `modalOpen`
- `useEffect` 调用 `getDepartments()` 加载列表
- `onFinish` 调用 `createDepartment` / `updateDepartment`
- 状态切换调用 `updateDepartment(id, { status: newStatus })`
- 删除使用 `Popconfirm` + `deleteDepartment`

- [ ] **Step 2: 注册到 componentMap 和 iconMap**

```typescript
// intelligent_reimbursement_system/src/router/componentMap.tsx 添加：
import DepartmentManage from "../pages/DepartmentManage";
// 在 componentMap 中添加: DepartmentManage,

// intelligent_reimbursement_system/src/router/iconMap.tsx 添加：
import { ApartmentOutlined } from "@ant-design/icons";
// 在 iconMap 中添加: ApartmentOutlined: <ApartmentOutlined />,
```

---

## Task 8: 员工管理前端页面

**Files:**
- Create: `intelligent_reimbursement_system/src/pages/EmployeeManage.tsx`
- Modify: `intelligent_reimbursement_system/src/router/componentMap.tsx`

- [ ] **Step 1: 创建 EmployeeManage 页面**

```tsx
// intelligent_reimbursement_system/src/pages/EmployeeManage.tsx
// 顶部：Input.Search(姓名) + Select(部门筛选) + Button(新增)
// 表格列：工号、姓名、性别(Tag)、部门、职位、手机、状态(Switch)、操作
// 使用 Table 的 pagination 属性对接后端分页
// 新增/编辑 Modal：employee_no, name, gender(Radio), dept_id(Select从部门接口), position, phone, status
```

核心结构：
- `useState` 管理 `empList`, `total`, `page`, `pageSize`, `searchName`, `filterDept`, `loading`
- `useEffect` 调用 `getEmployees({ name, dept_id, page, page_size })`
- 部门筛选下拉从 `getDepartments()` 获取
- 性别渲染：`{ 0: '未知', 1: '男', 2: '女' }` 用 Tag

- [ ] **Step 2: 注册到 componentMap**

```typescript
// componentMap.tsx 添加：
import EmployeeManage from "../pages/EmployeeManage";
// 在 componentMap 中添加: EmployeeManage,
```

---

## Task 9: 审批流管理前端页面（拖拽编排）

**Files:**
- Create: `intelligent_reimbursement_system/src/pages/ApprovalFlowManage.tsx`
- Modify: `intelligent_reimbursement_system/src/router/componentMap.tsx`

- [ ] **Step 1: 创建 ApprovalFlowManage 页面**

```tsx
// intelligent_reimbursement_system/src/pages/ApprovalFlowManage.tsx
// 布局：左右分栏 (Row + Col)
//
// 左侧 Col span=8：
//   - Card 标题"报销类型"
//   - List 渲染报销类型列表
//   - 每项显示：类型名称、是否已绑定审批流(Tag)、是否启用(Switch)
//   - 点击选中类型，右侧显示对应审批流配置
//
// 右侧 Col span=16：
//   - Card 标题"审批流配置"
//   - 顶部：Input(审批流名称) + Switch(启用/关闭，仅管理员)
//   - 中间：DndContext + SortableContext 拖拽区域
//     - 每个节点是一个 SortableItem 卡片
//     - 卡片显示：拖拽手柄 + 头像(Avatar) + 姓名 + 部门 + 职位 + Select(会签/或签) + 删除按钮
//   - 底部：Button(添加审批人) + Button(保存)
//   - 添加审批人：弹出 Modal，Select showSearch 从 /api/employees 搜索选择
//
// 使用 @dnd-kit 实现拖拽排序（参考 ReimbursementTypeCreate.tsx 中的 DraggableRow 模式）
```

核心状态：
```typescript
const [typeList, setTypeList] = useState<ReimbursementType[]>([]);
const [flowList, setFlowList] = useState<ApprovalFlow[]>([]);
const [selectedTypeCode, setSelectedTypeCode] = useState<string | null>(null);
const [flowName, setFlowName] = useState('');
const [flowEnabled, setFlowEnabled] = useState(false);
const [nodes, setNodes] = useState<FlowNode[]>([]);
// FlowNode = { node_id: string; name: string; approver_id: string; sign_type: string; sort: number; approver_info?: Employee }
```

- [ ] **Step 2: 注册到 componentMap 和 iconMap**

```typescript
// componentMap.tsx 添加：
import ApprovalFlowManage from "../pages/ApprovalFlowManage";
// 在 componentMap 中添加: ApprovalFlowManage,

// iconMap.tsx 添加：
import { BranchesOutlined } from "@ant-design/icons";
// 在 iconMap 中添加: BranchesOutlined: <BranchesOutlined />,
```

---

## Task 10: 注册页面联动 + AppModule 注册

**Files:**
- Modify: `intelligent_reimbursement_system/src/pages/RegisterPage.tsx`
- Modify: `intelligent_reimbursement_system_server/src/app.module.ts`

- [ ] **Step 1: RegisterPage 部门改为动态获取**

```typescript
// intelligent_reimbursement_system/src/pages/RegisterPage.tsx
// 删除硬编码的 departmentOptions
// 添加 useEffect 调用 getDepartments() 获取部门列表
// Select 的 options 从接口数据映射：{ label: dept.name, value: dept.name }
```

- [ ] **Step 2: 确认 AppModule 已注册所有新模块**

```typescript
// intelligent_reimbursement_system_server/src/app.module.ts
// imports 中应包含：
// DepartmentModule, EmployeeModule, ApprovalFlowModule, ApprovalRecordModule
```

- [ ] **Step 3: 验证全部功能**

```bash
# 后端启动
cd intelligent_reimbursement_system_server && npm run start:dev

# 前端启动
cd intelligent_reimbursement_system && npm run dev

# 验证：
# 1. 部门管理页面 - 增删改查
# 2. 员工管理页面 - 增删改查 + 分页搜索
# 3. 审批流管理页面 - 选择报销类型 → 拖拽编排 → 保存 → 开关
# 4. 注册页面 - 部门下拉动态加载
```

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "feat: add department, employee, and approval flow modules"
```

---

## Task Dependency Graph

```
Task 1 (rename reimbursement) ──┐
                                 ├── Task 5 (ApprovalRecord backend)
Task 2 (Department backend) ────┤
Task 3 (Employee backend) ──────┤
Task 4 (ApprovalFlow backend) ──┘
                                 │
                                 ├── Task 6 (Frontend API layer)
                                 │
                                 ├── Task 7 (DepartmentManage page)
                                 ├── Task 8 (EmployeeManage page)
                                 ├── Task 9 (ApprovalFlowManage page)
                                 │
                                 └── Task 10 (RegisterPage + AppModule + verify)
```

Tasks 1-4 可并行。Task 5 依赖 1-4。Tasks 6-9 依赖 Task 5。Task 10 依赖所有前置任务。

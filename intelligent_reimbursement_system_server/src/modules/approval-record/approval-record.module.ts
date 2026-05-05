import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ApprovalRecordController } from './approval-record.controller';
import { ApprovalRecordService } from './approval-record.service';
import {
  ApprovalRecord,
  ApprovalRecordSchema,
} from '../../schemas/approval_record.schema';
import {
  ApprovalFlow,
  ApprovalFlowSchema,
} from '../../schemas/approval_flow.schema';
import { Employee, EmployeeSchema } from '../../schemas/employee.schema';
import { Department, DepartmentSchema } from '../../schemas/department.schema';
import { User, UserSchema } from '../../schemas/user.schema';
import {
  Reimbursement,
  ReimbursementSchema,
} from '../../schemas/reimbursement_records.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ApprovalRecord.name, schema: ApprovalRecordSchema },
      { name: ApprovalFlow.name, schema: ApprovalFlowSchema },
      { name: Employee.name, schema: EmployeeSchema },
      { name: Department.name, schema: DepartmentSchema },
      { name: Reimbursement.name, schema: ReimbursementSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [ApprovalRecordController],
  providers: [ApprovalRecordService],
  exports: [ApprovalRecordService],
})
export class ApprovalRecordModule {}

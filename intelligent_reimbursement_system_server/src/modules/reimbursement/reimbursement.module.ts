import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReimbursementController } from './reimbursement.controller';
import { ReimbursementService } from './reimbursement.service';
import {
  Reimbursement,
  ReimbursementSchema,
} from '../../schemas/reimbursement_records.schema';
import {
  ReimbursementType,
  ReimbursementTypeSchema,
} from '../../schemas/reimbursement_type.schema';
import { User, UserSchema } from '../../schemas/user.schema';
import { File, FileSchema } from '../../schemas/file.schema';
import { Employee, EmployeeSchema } from '../../schemas/employee.schema';
import { Department, DepartmentSchema } from '../../schemas/department.schema';
import {
  InvoiceInfo,
  InvoiceInfoSchema,
} from '../../schemas/invoice_info.schema';
import { ApprovalRecordModule } from '../approval-record/approval-record.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Reimbursement.name, schema: ReimbursementSchema },
      { name: ReimbursementType.name, schema: ReimbursementTypeSchema },
      { name: User.name, schema: UserSchema },
      { name: File.name, schema: FileSchema },
      { name: Employee.name, schema: EmployeeSchema },
      { name: Department.name, schema: DepartmentSchema },
      { name: InvoiceInfo.name, schema: InvoiceInfoSchema },
    ]),
    ApprovalRecordModule,
  ],
  controllers: [ReimbursementController],
  providers: [ReimbursementService],
  exports: [ReimbursementService],
})
export class ReimbursementModule {}

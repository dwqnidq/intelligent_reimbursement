import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ApprovalRecord,
  ApprovalRecordSchema,
} from '../../schemas/approval_record.schema';
import {
  Reimbursement,
  ReimbursementSchema,
} from '../../schemas/reimbursement_records.schema';
import { Employee, EmployeeSchema } from '../../schemas/employee.schema';
import { FeishuUser, FeishuUserSchema } from '../../schemas/feishu_user.schema';
import { User, UserSchema } from '../../schemas/user.schema';
import {
  NotificationDelivery,
  NotificationDeliverySchema,
} from '../../schemas/notification_delivery.schema';
import { NotificationModule } from '../notification/notification.module';
import { FeishuApiClient } from '../feishu-bot/feishu-api.client';
import { ApprovalNotifyService } from './approval-notify.service';

@Module({
  imports: [
    NotificationModule,
    MongooseModule.forFeature([
      { name: ApprovalRecord.name, schema: ApprovalRecordSchema },
      { name: Reimbursement.name, schema: ReimbursementSchema },
      { name: Employee.name, schema: EmployeeSchema },
      { name: FeishuUser.name, schema: FeishuUserSchema },
      { name: User.name, schema: UserSchema },
      { name: NotificationDelivery.name, schema: NotificationDeliverySchema },
    ]),
  ],
  providers: [ApprovalNotifyService, FeishuApiClient],
  exports: [ApprovalNotifyService],
})
export class ApprovalNotifyModule {}

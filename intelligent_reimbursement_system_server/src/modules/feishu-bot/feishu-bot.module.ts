import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FeishuBotController } from './feishu-bot.controller';
import { FeishuBotService } from './feishu-bot.service';
import { FeishuApiClient } from './feishu-api.client';
import { FeishuIdentityService } from './feishu-identity.service';
import { FeishuWsService } from './feishu-ws.service';
import { FeishuMessageBatchService } from './feishu-message-batch.service';
import { BotSession, BotSessionSchema } from '../../schemas/bot_session.schema';
import { User, UserSchema } from '../../schemas/user.schema';
import { Employee, EmployeeSchema } from '../../schemas/employee.schema';
import { Department, DepartmentSchema } from '../../schemas/department.schema';
import { FeishuUser, FeishuUserSchema } from '../../schemas/feishu_user.schema';
import { AiModule } from '../ai/ai.module';
import { FileModule } from '../file/file.module';
import { ReimbursementModule } from '../reimbursement/reimbursement.module';
import { ReimbursementTypeModule } from '../reimbursement-type/reimbursement-type.module';
import { CompanyModule } from '../company/company.module';
import { UserModule } from '../user/user.module';
import { ApprovalRecordModule } from '../approval-record/approval-record.module';
import { ApprovalNotifyModule } from '../approval-notify/approval-notify.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BotSession.name, schema: BotSessionSchema },
      { name: User.name, schema: UserSchema },
      { name: Employee.name, schema: EmployeeSchema },
      { name: Department.name, schema: DepartmentSchema },
      { name: FeishuUser.name, schema: FeishuUserSchema },
    ]),
    AiModule,
    FileModule,
    ReimbursementModule,
    ReimbursementTypeModule,
    CompanyModule,
    UserModule,
    forwardRef(() => ApprovalRecordModule),
    ApprovalNotifyModule,
  ],
  controllers: [FeishuBotController],
  providers: [
    FeishuBotService,
    FeishuApiClient,
    FeishuIdentityService,
    FeishuWsService,
    FeishuMessageBatchService,
  ],
  exports: [FeishuApiClient],
})
export class FeishuBotModule {}

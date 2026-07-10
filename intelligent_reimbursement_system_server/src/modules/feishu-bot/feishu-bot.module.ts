import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FeishuBotController } from './feishu-bot.controller';
import { FeishuBotService } from './feishu-bot.service';
import { FeishuApiClient } from './feishu-api.client';
import { FeishuIdentityService } from './feishu-identity.service';
import { BotSession, BotSessionSchema } from '../../schemas/bot_session.schema';
import { User, UserSchema } from '../../schemas/user.schema';
import { Employee, EmployeeSchema } from '../../schemas/employee.schema';
import { Department, DepartmentSchema } from '../../schemas/department.schema';
import { AiModule } from '../ai/ai.module';
import { FileModule } from '../file/file.module';
import { ReimbursementModule } from '../reimbursement/reimbursement.module';
import { ReimbursementTypeModule } from '../reimbursement-type/reimbursement-type.module';
import { CompanyModule } from '../company/company.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BotSession.name, schema: BotSessionSchema },
      { name: User.name, schema: UserSchema },
      { name: Employee.name, schema: EmployeeSchema },
      { name: Department.name, schema: DepartmentSchema },
    ]),
    AiModule,
    FileModule,
    ReimbursementModule,
    ReimbursementTypeModule,
    CompanyModule,
    UserModule,
  ],
  controllers: [FeishuBotController],
  providers: [FeishuBotService, FeishuApiClient, FeishuIdentityService],
})
export class FeishuBotModule {}

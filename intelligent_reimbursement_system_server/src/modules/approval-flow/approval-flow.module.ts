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

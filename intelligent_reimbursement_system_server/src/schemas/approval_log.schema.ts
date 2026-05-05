import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, versionKey: false })
export class ApprovalLog extends Document {
  @Prop({ type: String, ref: 'Reimbursement', required: true })
  reimbursement: string;

  @Prop({ type: String, ref: 'User', required: true })
  approver: string;

  @Prop({ required: true, enum: ['approve', 'reject'] })
  action: string;

  @Prop()
  remark: string;

  @Prop({ default: '财务审批' })
  node: string;
}

export const ApprovalLogSchema = SchemaFactory.createForClass(ApprovalLog);

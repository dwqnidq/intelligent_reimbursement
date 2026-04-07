import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class ApprovalLog extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Reimbursement', required: true })
  reimbursement: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  approver: Types.ObjectId;

  @Prop({ required: true, enum: ['approve', 'reject'] })
  action: string;

  @Prop()
  remark: string;

  @Prop({ default: '财务审批' })
  node: string;
}

export const ApprovalLogSchema = SchemaFactory.createForClass(ApprovalLog);

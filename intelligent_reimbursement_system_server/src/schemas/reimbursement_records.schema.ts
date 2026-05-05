import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'reimbursements_records', versionKey: false })
export class Reimbursement extends Document {
  @Prop({ required: true, index: true })
  submission_batch_id: string;

  @Prop({ type: String, ref: 'User', required: true })
  applicant: string;

  @Prop({ type: String, ref: 'ReimbursementType', required: true })
  category: string;

  @Prop()
  category_name: string;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ type: Object, required: true })
  detail: Record<string, any>;

  @Prop({ type: [String], ref: 'File', default: [] })
  attachments: string[];

  @Prop({
    default: 'pending',
    enum: ['pending', 'approved', 'rejected', 'withdrawn'],
  })
  status: string;

  @Prop({ type: String, ref: 'User' })
  approver: string;

  @Prop()
  approved_at: string;

  @Prop({ required: true })
  apply_date: string;

  @Prop()
  reject_reason: string;

  @Prop({ default: false })
  is_over_limit: boolean;

  @Prop({ default: false })
  has_approval_flow: boolean;
}

export const ReimbursementSchema = SchemaFactory.createForClass(Reimbursement);

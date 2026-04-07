import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'reimbursements_records' })
export class Reimbursement extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  applicant: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'ReimbursementType', required: true })
  category: Types.ObjectId;

  @Prop()
  category_name: string;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ type: Object, required: true })
  detail: Record<string, any>;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'File' }] })
  attachments: Types.ObjectId[];

  @Prop({
    default: 'pending',
    enum: ['pending', 'approved', 'rejected', 'withdrawn'],
  })
  status: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  approver: Types.ObjectId;

  @Prop()
  approved_at: string;

  @Prop({ required: true })
  apply_date: string;

  @Prop()
  reject_reason: string;

  @Prop({ default: false })
  is_over_limit: boolean;
}

export const ReimbursementSchema = SchemaFactory.createForClass(Reimbursement);

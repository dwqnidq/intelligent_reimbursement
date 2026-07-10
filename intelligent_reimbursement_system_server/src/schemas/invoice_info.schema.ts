import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'invoice_infos', versionKey: false })
export class InvoiceInfo extends Document {
  @Prop({ required: true, unique: true, index: true, trim: true })
  invoice_number: string;

  @Prop({ default: '', trim: true })
  invoice_title: string;

  @Prop({ default: '' })
  invoice_date: string;

  @Prop({ default: '', trim: true })
  issuer: string;

  @Prop({ type: String, ref: 'Reimbursement', required: true })
  reimbursement_id: string;

  @Prop({ type: String, ref: 'User', required: true })
  uploaded_by: string;
}

export const InvoiceInfoSchema = SchemaFactory.createForClass(InvoiceInfo);

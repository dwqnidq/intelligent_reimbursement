import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/** 报销单填写方式全局配置（单例文档，_id 固定为 default） */
@Schema({ timestamps: true, collection: 'reimbursement_form_settings', versionKey: false })
export class ReimbursementFormSettings extends Document {
  @Prop({ required: true, unique: true, default: 'default' })
  key: string;

  @Prop({ default: true })
  smart_fill_enabled: boolean;

  @Prop({ default: true })
  manual_fill_enabled: boolean;
}

export const ReimbursementFormSettingsSchema = SchemaFactory.createForClass(
  ReimbursementFormSettings,
);

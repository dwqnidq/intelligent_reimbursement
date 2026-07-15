import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

/** 下拉选项；写入侧统一为 { label, value } */
export class FieldOption {
  label: string;
  value: string;
}

@Schema({ _id: false })
export class FieldConfig {
  @Prop({ required: true })
  key: string;

  @Prop({ required: true })
  label: string;

  @Prop({ default: 'text', enum: ['text', 'number', 'date', 'select', 'textarea'] })
  type: string;

  @Prop({ default: false })
  required: boolean;

  /**
   * Mixed：兼容历史 string[]；create/update 时归一化为 { label, value }[]。
   */
  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
  options: FieldOption[];

  @Prop({ default: 0 })
  sort: number;

  @Prop({ default: false })
  is_calculate: boolean;
}

export const FieldConfigSchema = SchemaFactory.createForClass(FieldConfig);

@Schema({ _id: false })
export class ExportField {
  @Prop({ required: true })
  key: string;

  @Prop({ required: true })
  label: string;

  @Prop({ default: 0 })
  sort: number;

  @Prop()
  formula: string;

  @Prop({ default: false })
  is_calculate: boolean;

  @Prop({ default: [] })
  calc_fields: string[];
}

export const ExportFieldSchema = SchemaFactory.createForClass(ExportField);

@Schema({ timestamps: true, collection: 'reimbursement_types', versionKey: false })
export class ReimbursementType extends Document {
  @Prop({ required: true, unique: true })
  code: string;

  @Prop({ required: true, unique: true })
  name: string;

  @Prop({ required: true })
  label: string;

  @Prop({ type: [FieldConfigSchema] })
  fields: FieldConfig[];

  @Prop({ type: [ExportFieldSchema], default: [] })
  export_fields: ExportField[];

  @Prop()
  formula: string;

  @Prop({ default: 1, enum: [0, 1] })
  status: number;

  @Prop({ default: null })
  over_limit_threshold: number;

  @Prop()
  remark: string;

  /** 类型业务描述，供 AI 发票识别时区分相近类型 */
  @Prop()
  description: string;
}

export const ReimbursementTypeSchema =
  SchemaFactory.createForClass(ReimbursementType);

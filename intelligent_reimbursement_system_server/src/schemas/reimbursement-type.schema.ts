import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ _id: false })
export class FieldConfig {
  @Prop({ required: true })
  key: string;

  @Prop({ required: true })
  label: string;

  @Prop({ default: 'text', enum: ['text', 'number', 'date', 'select'] })
  type: string;

  @Prop({ default: false })
  required: boolean;

  @Prop({ type: [String], default: [] })
  options: string[];

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

@Schema({ timestamps: true, collection: 'reimbursement_types' })
export class ReimbursementType extends Document {
  @Prop({ required: true, unique: true })
  code: string;

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
}

export const ReimbursementTypeSchema =
  SchemaFactory.createForClass(ReimbursementType);

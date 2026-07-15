import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ _id: false })
export class ApprovalNode {
  @Prop({ required: true })
  node_id: string;

  @Prop({ type: [String], ref: 'Employee', default: [] })
  approver_ids: string[];

  /** 与 approver_ids 等长；true 表示该审批人开启推送；缺省/旧数据按 true */
  @Prop({ type: [Boolean], default: [] })
  notify_flags: boolean[];

  @Prop({ required: true, enum: ['countersign', 'orsign'] })
  sign_type: string;

  @Prop({ required: true })
  sort: number;
}

export const ApprovalNodeSchema = SchemaFactory.createForClass(ApprovalNode);

@Schema({ timestamps: true, collection: 'approval_flow', versionKey: false })
export class ApprovalFlow extends Document {
  @Prop({ required: true })
  type_code: string;

  @Prop({ required: true, default: false })
  enabled: boolean;

  @Prop({ type: [ApprovalNodeSchema], default: [] })
  nodes: ApprovalNode[];

  @Prop({ type: String, ref: 'User' })
  created_by: string;

  @Prop({ type: Number, default: 0 })
  amount_min: number;

  @Prop({ type: Number, default: null })
  amount_max: number | null;

  @Prop({ type: Number, default: 0 })
  priority: number;
}

export const ApprovalFlowSchema = SchemaFactory.createForClass(ApprovalFlow);

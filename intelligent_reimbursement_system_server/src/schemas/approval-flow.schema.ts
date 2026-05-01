import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ _id: false })
export class ApprovalNode {
  @Prop({ required: true })
  node_id: string;

  @Prop({ required: true })
  name: string;

  @Prop({ type: Types.ObjectId, ref: 'Employee', required: true })
  approver_id: Types.ObjectId;

  @Prop({ required: true, enum: ['countersign', 'orsign'] })
  sign_type: string;

  @Prop({ required: true })
  sort: number;
}

export const ApprovalNodeSchema = SchemaFactory.createForClass(ApprovalNode);

@Schema({ timestamps: true, collection: 'approval_flow' })
export class ApprovalFlow extends Document {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  type_code: string;

  @Prop({ required: true, default: false })
  enabled: boolean;

  @Prop({ type: [ApprovalNodeSchema], default: [] })
  nodes: ApprovalNode[];

  @Prop({ type: Types.ObjectId, ref: 'User' })
  created_by: Types.ObjectId;
}

export const ApprovalFlowSchema = SchemaFactory.createForClass(ApprovalFlow);

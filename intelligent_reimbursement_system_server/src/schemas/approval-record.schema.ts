import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ──── Snapshot approver info (pure data, no ObjectId) ────
@Schema({ _id: false })
export class ApproverInfo {
  @Prop({ required: true })
  name: string;

  @Prop()
  avatar: string;

  @Prop()
  dept_name: string;

  @Prop()
  position: string;
}
export const ApproverInfoSchema = SchemaFactory.createForClass(ApproverInfo);

// ──── Snapshot node ────
@Schema({ _id: false })
export class SnapshotNode {
  @Prop({ required: true })
  node_id: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, enum: ['countersign', 'orsign'] })
  sign_type: string;

  @Prop({ type: ApproverInfoSchema, required: true })
  approver: ApproverInfo;
}
export const SnapshotNodeSchema = SchemaFactory.createForClass(SnapshotNode);

// ──── Flow snapshot ────
@Schema({ _id: false })
export class FlowSnapshot {
  @Prop({ required: true })
  name: string;

  @Prop({ type: [SnapshotNodeSchema], required: true })
  nodes: SnapshotNode[];
}
export const FlowSnapshotSchema = SchemaFactory.createForClass(FlowSnapshot);

// ──── Approval action record ────
@Schema({ _id: false })
export class ApprovalAction {
  @Prop({ required: true })
  node_id: string;

  @Prop({ required: true })
  approver_name: string;

  @Prop({ required: true, enum: ['approve', 'reject'] })
  action: string;

  @Prop()
  comment: string;

  @Prop({ required: true })
  acted_at: Date;
}
export const ApprovalActionSchema = SchemaFactory.createForClass(ApprovalAction);

// ──── Main record ────
@Schema({ timestamps: true, collection: 'approval_record' })
export class ApprovalRecord extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Reimbursement', required: true })
  record_id: Types.ObjectId;

  @Prop({ type: FlowSnapshotSchema, required: true })
  flow_snapshot: FlowSnapshot;

  @Prop({ required: true, default: 0 })
  cur_node_idx: number;

  @Prop({ required: true, default: 'pending', enum: ['pending', 'approved', 'rejected'] })
  status: string;

  @Prop({ type: [ApprovalActionSchema], default: [] })
  actions: ApprovalAction[];
}

export const ApprovalRecordSchema = SchemaFactory.createForClass(ApprovalRecord);

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// ──── Snapshot approver info (pure data, no ObjectId) ────
@Schema({ _id: false })
export class ApproverInfo {
  @Prop({ required: true })
  approver_id: string;

  @Prop({ required: true })
  name: string;

  @Prop()
  avatar: string;

  @Prop()
  dept_name: string;

  @Prop()
  position: string;

  /** 创建快照时冻结：是否向该审批人推送 */
  @Prop({ default: true })
  notify: boolean;

  /** pending | approved | skipped | rejected；缺省按 pending */
  @Prop({ default: 'pending' })
  participation: string;
}
export const ApproverInfoSchema = SchemaFactory.createForClass(ApproverInfo);

// ──── Snapshot node ────
@Schema({ _id: false })
export class SnapshotNode {
  @Prop({ required: true })
  node_id: string;

  @Prop({ required: true, enum: ['countersign', 'orsign'] })
  sign_type: string;

  @Prop({ type: [ApproverInfoSchema], default: [] })
  approvers: ApproverInfo[];

  @Prop({ type: [String], default: [] })
  approved_by: string[];

  // { originalApproverName: transferredToName }
  @Prop({ type: Object, default: {} })
  transfers: Record<string, string>;
}
export const SnapshotNodeSchema = SchemaFactory.createForClass(SnapshotNode);

// ──── Flow snapshot ────
@Schema({ _id: false })
export class FlowSnapshot {
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

  @Prop({ required: true, enum: ['approve', 'reject', 'transfer'] })
  action: string;

  @Prop()
  comment: string;

  @Prop({ required: true })
  acted_at: Date;

  @Prop()
  transferred_to_name: string;
}
export const ApprovalActionSchema = SchemaFactory.createForClass(ApprovalAction);

// ──── Main record ────
@Schema({ timestamps: true, collection: 'approval_records', versionKey: false })
export class ApprovalRecord extends Document {
  @Prop({ type: String, required: true })
  record_id: string;

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

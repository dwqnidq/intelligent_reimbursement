import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'notifications', versionKey: false })
export class Notification extends Document {
  @Prop({ type: String, ref: 'User', required: true, index: true })
  user_id: string;

  @Prop({
    required: true,
    enum: ['approval_pending', 'approval_skipped', 'approval_result'],
  })
  type: string;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  body: string;

  @Prop({ type: Object, default: {} })
  payload: Record<string, unknown>;

  @Prop({ default: false })
  read: boolean;

  /** 幂等键，防止重复写入站内通知 */
  @Prop({ unique: true, sparse: true })
  idempotency_key?: string;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

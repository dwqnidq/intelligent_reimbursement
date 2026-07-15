import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({
  timestamps: true,
  collection: 'notification_deliveries',
  versionKey: false,
})
export class NotificationDelivery extends Document {
  @Prop({ type: String, ref: 'Notification' })
  notification_id?: string;

  @Prop({ required: true, enum: ['web', 'feishu'] })
  channel: string;

  @Prop({
    required: true,
    enum: ['sent', 'failed', 'updated', 'skipped_no_binding'],
  })
  status: string;

  @Prop()
  feishu_message_id?: string;

  @Prop({ required: true, unique: true })
  idempotency_key: string;

  @Prop()
  error?: string;

  @Prop({ type: Object, default: {} })
  meta?: Record<string, unknown>;
}

export const NotificationDeliverySchema =
  SchemaFactory.createForClass(NotificationDelivery);

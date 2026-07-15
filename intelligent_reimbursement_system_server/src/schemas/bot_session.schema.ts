import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type BotSessionStatus =
  | 'awaiting_upload'
  | 'awaiting_confirm'
  | 'recognizing'
  | 'awaiting_submit'
  | 'awaiting_profile'
  | 'submitted'
  | 'cancelled'
  | 'expired';

export type FeishuSourceFileKind = 'image' | 'pdf' | 'zip' | 'folder' | 'other';

@Schema({ _id: false, versionKey: false })
export class BotSourceFile {
  @Prop({ required: true })
  file_key: string;

  @Prop({ required: true })
  file_name: string;

  @Prop({ required: true, enum: ['image', 'pdf', 'zip', 'folder', 'other'] })
  kind: FeishuSourceFileKind;

  @Prop()
  message_id?: string;

  @Prop({ enum: ['file', 'image'], default: 'file' })
  resource_type?: 'file' | 'image';
}

@Schema({ _id: false, versionKey: false })
export class BotRecognizedItem {
  @Prop({ required: true })
  file_name: string;

  @Prop()
  category_id?: string;

  @Prop()
  category_label?: string;

  @Prop({ required: true, default: false })
  matched: boolean;

  @Prop()
  invoice_number?: string;

  @Prop()
  invoice_title?: string;

  @Prop()
  invoice_date?: string;

  @Prop()
  issuer?: string;

  @Prop({ type: Object, default: {} })
  details: Record<string, unknown>;

  @Prop()
  amount?: number;

  @Prop({ default: false })
  duplicate?: boolean;

  @Prop()
  file_key?: string;

  @Prop()
  attachment_id?: string;

  @Prop()
  local_temp_path?: string;
}

@Schema({ _id: false, versionKey: false })
export class BotMessageIds {
  @Prop()
  confirm?: string;

  @Prop()
  confirm_sent_at?: Date;

  @Prop()
  result?: string;

  @Prop()
  profile?: string;

  @Prop()
  progress?: string;
}

@Schema({ timestamps: true, collection: 'bot_sessions', versionKey: false })
export class BotSession extends Document {
  @Prop({ required: true, unique: true, index: true })
  session_id: string;

  @Prop({ required: true, index: true })
  open_id: string;

  @Prop({ required: true })
  chat_id: string;

  @Prop({ index: true })
  trigger_message_id?: string;

  @Prop({ type: [String], default: [], index: true })
  trigger_message_ids: string[];

  @Prop({ type: String, ref: 'User' })
  user_id?: string;

  @Prop({
    required: true,
    enum: [
      'awaiting_upload',
      'awaiting_confirm',
      'recognizing',
      'awaiting_submit',
      'awaiting_profile',
      'submitted',
      'cancelled',
      'expired',
    ],
    default: 'awaiting_upload',
  })
  status: BotSessionStatus;

  @Prop({ type: [BotSourceFile], default: [] })
  source_files: BotSourceFile[];

  @Prop({ type: [String], default: [] })
  skipped_names: string[];

  @Prop({ type: [BotRecognizedItem], default: [] })
  recognized_items: BotRecognizedItem[];

  @Prop({ type: BotMessageIds, default: {} })
  message_ids: BotMessageIds;

  @Prop({ required: true, index: true })
  expires_at: Date;
}

export const BotSessionSchema = SchemaFactory.createForClass(BotSession);

BotSessionSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'feishu_users', versionKey: false })
export class FeishuUser extends Document {
  @Prop({ required: true, unique: true })
  open_id: string;

  @Prop()
  union_id: string;

  @Prop()
  name: string;

  @Prop()
  email: string;

  @Prop()
  mobile: string;

  @Prop()
  avatar_url: string;

  @Prop({ type: String, ref: 'User', required: true })
  uid: string;
}

export const FeishuUserSchema = SchemaFactory.createForClass(FeishuUser);

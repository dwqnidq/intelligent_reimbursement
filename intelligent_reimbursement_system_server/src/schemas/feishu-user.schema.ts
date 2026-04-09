import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'feishuusers' })
export class FeishuUser extends Document {
  @Prop({ required: true, unique: true })
  openId: string;

  @Prop()
  unionId: string;

  @Prop()
  name: string;

  @Prop()
  email: string;

  @Prop()
  mobile: string;

  @Prop()
  avatar_url: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  uid: Types.ObjectId;
}

export const FeishuUserSchema = SchemaFactory.createForClass(FeishuUser);

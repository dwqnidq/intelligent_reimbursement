import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ collection: 'opinion_info', timestamps: true })
export class Opinion extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  uid: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true, trim: true })
  content: string;

  @Prop({ default: 0, enum: [0, 1, 2] }) // 0待处理 1已处理 2已关闭
  status: number;
}

export const OpinionSchema = SchemaFactory.createForClass(Opinion);

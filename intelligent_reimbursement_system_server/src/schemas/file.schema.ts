import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class File extends Document {
  @Prop({ required: true, enum: ['avatar', 'attachment'] })
  type: string;

  @Prop({ required: true })
  url: string;

  @Prop({ required: true })
  original_name: string;

  @Prop()
  size: number;

  @Prop()
  mime_type: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  uploader: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  uid: Types.ObjectId;
}

export const FileSchema = SchemaFactory.createForClass(File);

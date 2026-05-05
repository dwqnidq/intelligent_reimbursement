import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, versionKey: false })
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

  @Prop({ type: String, ref: 'User', required: true })
  uploader: string;

  @Prop({ type: String, ref: 'User', required: true })
  uid: string;
}

export const FileSchema = SchemaFactory.createForClass(File);

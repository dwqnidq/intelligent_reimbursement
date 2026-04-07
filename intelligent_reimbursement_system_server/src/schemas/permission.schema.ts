import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Permission extends Document {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop({ required: true })
  label: string;

  @Prop({ required: true, enum: ['button', 'api'] })
  type: string;

  @Prop()
  resource: string;

  @Prop()
  action: string;

  @Prop()
  description: string;

  @Prop({ default: 1, enum: [0, 1] })
  status: number;
}

export const PermissionSchema = SchemaFactory.createForClass(Permission);

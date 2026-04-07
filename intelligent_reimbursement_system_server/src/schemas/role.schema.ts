import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Role extends Document {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop({ required: true })
  label: string;

  @Prop()
  description: string;

  @Prop({ default: 1, enum: [0, 1] })
  status: number;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Permission' }] })
  permissions: Types.ObjectId[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Menu' }] })
  menus: Types.ObjectId[];
}

export const RoleSchema = SchemaFactory.createForClass(Role);

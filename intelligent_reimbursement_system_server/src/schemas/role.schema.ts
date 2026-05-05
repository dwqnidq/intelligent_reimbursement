import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, versionKey: false })
export class Role extends Document {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop({ required: true })
  label: string;

  @Prop()
  description: string;

  @Prop({ default: 1, enum: [0, 1] })
  status: number;

  @Prop({ type: [String], ref: 'Permission', default: [] })
  permissions: string[];

  @Prop({ type: [String], ref: 'Menu', default: [] })
  menus: string[];
}

export const RoleSchema = SchemaFactory.createForClass(Role);

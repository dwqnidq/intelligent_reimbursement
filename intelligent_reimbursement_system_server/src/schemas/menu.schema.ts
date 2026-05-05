import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, versionKey: false })
export class Menu extends Document {
  @Prop({ required: true })
  name: string;

  @Prop()
  path: string;

  @Prop()
  component: string;

  @Prop()
  icon: string;

  @Prop({ default: 0 })
  sort: number;

  @Prop({ required: true, enum: ['directory', 'menu', 'button'] })
  type: string;

  @Prop({ type: String, ref: 'Menu', default: null })
  parent_id: string;

  @Prop({ type: String, ref: 'Permission' })
  permission: string;

  @Prop({ default: 1, enum: [0, 1] })
  visible: number;

  @Prop({ default: 1, enum: [0, 1] })
  status: number;
}

export const MenuSchema = SchemaFactory.createForClass(Menu);

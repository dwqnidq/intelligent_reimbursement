import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'department' })
export class Department extends Document {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop({ required: true, unique: true })
  code: string;

  @Prop({ type: Types.ObjectId, ref: 'Employee' })
  manager_id: Types.ObjectId;

  @Prop()
  description: string;

  @Prop({ required: true, default: 1, enum: [0, 1] })
  status: number;

  @Prop({ default: 0 })
  sort: number;
}

export const DepartmentSchema = SchemaFactory.createForClass(Department);

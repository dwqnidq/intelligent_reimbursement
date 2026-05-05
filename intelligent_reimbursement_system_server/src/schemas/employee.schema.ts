import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'employee', versionKey: false })
export class Employee extends Document {
  @Prop({ required: true, unique: true })
  employee_no: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, default: 0, enum: [0, 1, 2] })
  gender: number;

  @Prop({ type: String, ref: 'Department' })
  dept_id: string;

  @Prop()
  position: string;

  @Prop()
  phone: string;

  @Prop()
  avatar: string;

  @Prop({ required: true, default: 1, enum: [0, 1] })
  status: number;

  @Prop({ type: String, ref: 'User', default: null })
  uid: string;
}

export const EmployeeSchema = SchemaFactory.createForClass(Employee);

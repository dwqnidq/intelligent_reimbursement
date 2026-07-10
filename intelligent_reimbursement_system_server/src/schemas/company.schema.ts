import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'companies', versionKey: false })
export class Company extends Document {
  @Prop({ required: true, unique: true, trim: true })
  name: string;
}

export const CompanySchema = SchemaFactory.createForClass(Company);

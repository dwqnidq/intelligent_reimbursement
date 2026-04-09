import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';

@Schema({ timestamps: true })
export class User extends Document {
  @Prop({ required: true, unique: true, trim: true })
  username: string;

  @Prop({ required: true, minlength: 6 })
  password: string;

  @Prop({ required: true, unique: true, lowercase: true })
  email: string;

  @Prop({ required: true })
  real_name: string;

  @Prop()
  phone: string;

  @Prop({ default: '' })
  avatar: string;

  @Prop()
  department: string;

  @Prop({ default: 1, enum: [0, 1] })
  status: number;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Role' }] })
  roles: Types.ObjectId[];

  @Prop({ default: 'local', enum: ['local', 'feishu'] })
  auth_provider: 'local' | 'feishu';

  @Prop({ default: true })
  password_login_enabled: boolean;

  comparePassword: (plain: string) => Promise<boolean>;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.pre('save', async function (this: User) {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 10);
});

UserSchema.methods.comparePassword = function (this: User, plain: string) {
  return bcrypt.compare(plain, this.password);
};

UserSchema.set('toJSON', {
  transform: (_, ret) => {
    const { ...rest } = ret;
    return rest;
  },
});

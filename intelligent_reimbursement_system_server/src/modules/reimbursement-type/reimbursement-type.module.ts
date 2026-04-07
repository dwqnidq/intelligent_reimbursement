import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReimbursementTypeController } from './reimbursement-type.controller';
import { ReimbursementTypeService } from './reimbursement-type.service';
import {
  ReimbursementType,
  ReimbursementTypeSchema,
} from '../../schemas/reimbursement-type.schema';
import { User, UserSchema } from '../../schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ReimbursementType.name, schema: ReimbursementTypeSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [ReimbursementTypeController],
  providers: [ReimbursementTypeService],
  exports: [ReimbursementTypeService],
})
export class ReimbursementTypeModule {}

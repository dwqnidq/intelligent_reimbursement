import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReimbursementController } from './reimbursement.controller';
import { ReimbursementService } from './reimbursement.service';
import {
  Reimbursement,
  ReimbursementSchema,
} from '../../schemas/reimbursement.schema';
import {
  ReimbursementType,
  ReimbursementTypeSchema,
} from '../../schemas/reimbursement-type.schema';
import { User, UserSchema } from '../../schemas/user.schema';
import { File, FileSchema } from '../../schemas/file.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Reimbursement.name, schema: ReimbursementSchema },
      { name: ReimbursementType.name, schema: ReimbursementTypeSchema },
      { name: User.name, schema: UserSchema },
      { name: File.name, schema: FileSchema },
    ]),
  ],
  controllers: [ReimbursementController],
  providers: [ReimbursementService],
})
export class ReimbursementModule {}

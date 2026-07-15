import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ReimbursementFormSettings,
  ReimbursementFormSettingsSchema,
} from '../../schemas/reimbursement_form_settings.schema';
import { User, UserSchema } from '../../schemas/user.schema';
import { ReimbursementFormSettingsController } from './reimbursement-form-settings.controller';
import { ReimbursementFormSettingsService } from './reimbursement-form-settings.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ReimbursementFormSettings.name, schema: ReimbursementFormSettingsSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [ReimbursementFormSettingsController],
  providers: [ReimbursementFormSettingsService],
  exports: [ReimbursementFormSettingsService],
})
export class ReimbursementFormSettingsModule {}

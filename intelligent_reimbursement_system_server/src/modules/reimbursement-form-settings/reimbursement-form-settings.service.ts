import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ReimbursementFormSettings } from '../../schemas/reimbursement_form_settings.schema';
import { User } from '../../schemas/user.schema';
import { UpdateReimbursementFormSettingsDto } from './dto/update-reimbursement-form-settings.dto';

const SETTINGS_KEY = 'default';

export type ReimbursementFormSettingsView = {
  smart_fill_enabled: boolean;
  manual_fill_enabled: boolean;
};

@Injectable()
export class ReimbursementFormSettingsService implements OnModuleInit {
  constructor(
    @InjectModel(ReimbursementFormSettings.name)
    private settingsModel: Model<ReimbursementFormSettings>,
    @InjectModel(User.name)
    private userModel: Model<User>,
  ) {}

  async onModuleInit() {
    await this.settingsModel.updateOne(
      { key: SETTINGS_KEY },
      {
        $setOnInsert: {
          key: SETTINGS_KEY,
          smart_fill_enabled: true,
          manual_fill_enabled: true,
        },
      },
      { upsert: true },
    );
  }

  private async assertAdmin(userId: string) {
    const user = await this.userModel.findById(userId).populate('roles');
    const roles = user?.roles as unknown as { name: string }[];
    const isAdmin = roles?.some((r) => r.name === 'admin') ?? false;
    if (!isAdmin) throw new ForbiddenException('仅管理员可操作');
  }

  private toView(doc: ReimbursementFormSettings): ReimbursementFormSettingsView {
    return {
      smart_fill_enabled: Boolean(doc.smart_fill_enabled),
      manual_fill_enabled: Boolean(doc.manual_fill_enabled),
    };
  }

  async getSettings(): Promise<ReimbursementFormSettingsView> {
    const doc = await this.settingsModel.findOne({ key: SETTINGS_KEY });
    if (!doc) {
      return { smart_fill_enabled: true, manual_fill_enabled: true };
    }
    return this.toView(doc);
  }

  async updateSettings(
    userId: string,
    dto: UpdateReimbursementFormSettingsDto,
  ): Promise<ReimbursementFormSettingsView> {
    await this.assertAdmin(userId);
    if (!dto.smart_fill_enabled && !dto.manual_fill_enabled) {
      throw new BadRequestException('至少需启用一种填写方式');
    }

    const doc = await this.settingsModel.findOneAndUpdate(
      { key: SETTINGS_KEY },
      {
        $set: {
          smart_fill_enabled: dto.smart_fill_enabled,
          manual_fill_enabled: dto.manual_fill_enabled,
        },
        $setOnInsert: { key: SETTINGS_KEY },
      },
      { upsert: true, new: true },
    );

    return this.toView(doc);
  }
}

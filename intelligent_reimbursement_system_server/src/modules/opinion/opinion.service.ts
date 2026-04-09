import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Opinion } from '../../schemas/opinion.schema';
import { User } from '../../schemas/user.schema';
import { CreateOpinionDto } from './dto/create-opinion.dto';

@Injectable()
export class OpinionService {
  constructor(
    @InjectModel(Opinion.name) private opinionModel: Model<Opinion>,
    @InjectModel(User.name) private userModel: Model<User>,
  ) {}

  async create(uid: string, dto: CreateOpinionDto) {
    return this.opinionModel.create({ uid: new Types.ObjectId(uid), ...dto });
  }

  async findAll() {
    return this.opinionModel
      .find()
      .populate('uid', 'username real_name')
      .sort({ createdAt: -1 });
  }

  async findMine(userId: string) {
    return this.opinionModel
      .find({ uid: new Types.ObjectId(userId) })
      .populate('uid', 'username real_name')
      .sort({ createdAt: -1 });
  }

  private async assertCanManageOpinions(userId: string) {
    const user = await this.userModel.findById(userId).populate('roles');
    const roles = user?.roles as unknown as { name: string }[];
    const canManage =
      roles?.some((r) => r.name === 'admin' || r.name === 'opinion_admin') ??
      false;
    if (!canManage) throw new ForbiddenException('无权限修改意见反馈状态');
  }

  async updateStatus(userId: string, id: string, status: number) {
    await this.assertCanManageOpinions(userId);
    const updated = await this.opinionModel
      .findByIdAndUpdate(id, { $set: { status } }, { new: true })
      .populate('uid', 'username real_name');
    if (!updated) throw new NotFoundException('意见反馈不存在');
    return updated;
  }
}

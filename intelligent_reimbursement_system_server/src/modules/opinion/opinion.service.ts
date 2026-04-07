import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Opinion } from '../../schemas/opinion.schema';
import { CreateOpinionDto } from './dto/create-opinion.dto';

@Injectable()
export class OpinionService {
  constructor(
    @InjectModel(Opinion.name) private opinionModel: Model<Opinion>,
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
}

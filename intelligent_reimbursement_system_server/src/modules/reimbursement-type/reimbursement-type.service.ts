import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ReimbursementType } from '../../schemas/reimbursement-type.schema';
import { User } from '../../schemas/user.schema';
import { CreateReimbursementTypeDto } from './dto/create-reimbursement-type.dto';
import { UpdateReimbursementTypeDto } from './dto/update-reimbursement-type.dto';

@Injectable()
export class ReimbursementTypeService {
  constructor(
    @InjectModel(ReimbursementType.name)
    private typeModel: Model<ReimbursementType>,
    @InjectModel(User.name)
    private userModel: Model<User>,
  ) {}

  async findAll(userId: string) {
    const user = await this.userModel.findById(userId).populate('roles');
    const roles = user?.roles as unknown as { name: string }[];
    const isAdmin = roles?.some((r) => r.name === 'admin') ?? false;

    const filter = isAdmin ? {} : { status: 1 };
    return this.typeModel
      .find(filter)
      .select('code label fields formula over_limit_threshold export_fields status')
      .sort({ createdAt: 1 });
  }

  async create(dto: CreateReimbursementTypeDto) {
    const exists = await this.typeModel.findOne({
      $or: [{ code: dto.code }, { label: dto.label }],
    });
    if (exists) {
      if (exists.code === dto.code)
        throw new ConflictException('类型标识符已存在');
      if (exists.label === dto.label)
        throw new ConflictException('类型名称已存在');
    }
    const record = await this.typeModel.create(dto);
    return { id: record._id };
  }

  async update(id: string, dto: UpdateReimbursementTypeDto) {
    const record = await this.typeModel.findById(id);
    if (!record) throw new NotFoundException('报销类型不存在');

    if (dto.code || dto.label) {
      const query: {
        _id: { $ne: string };
        code?: string;
        label?: string;
      } = { _id: { $ne: id } };
      if (dto.code) query.code = dto.code;
      if (dto.label) query.label = dto.label;
      const exists = await this.typeModel.findOne(query);
      if (exists) {
        if (dto.code && exists.code === dto.code)
          throw new ConflictException('类型标识符已存在');
        if (dto.label && exists.label === dto.label)
          throw new ConflictException('类型名称已存在');
      }
    }

    Object.assign(record, dto);
    await record.save();
    return { id: record._id };
  }

  async remove(id: string) {
    const record = await this.typeModel.findById(id);
    if (!record) throw new NotFoundException('报销类型不存在');
    await this.typeModel.deleteOne({ _id: id });
    return { id };
  }
}

import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Department } from '../../schemas/department.schema';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

@Injectable()
export class DepartmentService {
  constructor(
    @InjectModel(Department.name)
    private deptModel: Model<Department>,
  ) {}

  async findAll(query?: { status?: number }) {
    const filter: Record<string, unknown> = {};
    if (query?.status !== undefined) filter.status = query.status;
    return this.deptModel
      .find(filter)
      .populate('manager_id', 'name avatar position')
      .sort({ sort: 1, createdAt: 1 });
  }

  async create(dto: CreateDepartmentDto) {
    const exists = await this.deptModel.findOne({
      $or: [{ name: dto.name }, { code: dto.code }],
    });
    if (exists) {
      if (exists.name === dto.name) throw new ConflictException('部门名称已存在');
      throw new ConflictException('部门编码已存在');
    }
    const doc = await this.deptModel.create(dto);
    return { id: doc._id };
  }

  async update(id: string, dto: UpdateDepartmentDto) {
    const record = await this.deptModel.findById(id);
    if (!record) throw new NotFoundException('部门不存在');

    if (dto.name || dto.code) {
      const query: Record<string, unknown> = { _id: { $ne: id } };
      const or: Record<string, unknown>[] = [];
      if (dto.name) or.push({ name: dto.name });
      if (dto.code) or.push({ code: dto.code });
      if (or.length) {
        query.$or = or;
        const exists = await this.deptModel.findOne(query);
        if (exists) {
          if (exists.name === dto.name) throw new ConflictException('部门名称已存在');
          throw new ConflictException('部门编码已存在');
        }
      }
    }

    Object.assign(record, dto);
    await record.save();
    return { id: record._id };
  }

  async remove(id: string) {
    const record = await this.deptModel.findById(id);
    if (!record) throw new NotFoundException('部门不存在');
    await this.deptModel.deleteOne({ _id: id });
    return { id };
  }
}

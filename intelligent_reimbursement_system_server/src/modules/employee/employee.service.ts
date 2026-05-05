import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Employee } from '../../schemas/employee.schema';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

@Injectable()
export class EmployeeService {
  constructor(
    @InjectModel(Employee.name)
    private empModel: Model<Employee>,
  ) {}

  async findAll(query?: { name?: string; dept_id?: string; page?: number; page_size?: number }) {
    const filter: Record<string, unknown> = {};
    if (query?.name) filter.name = { $regex: query.name, $options: 'i' };
    if (query?.dept_id) filter.dept_id = query.dept_id;

    const page = query?.page || 1;
    const pageSize = query?.page_size || 20;

    const [list, total] = await Promise.all([
      this.empModel
        .find(filter)
        .populate('dept_id', 'name code')
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize),
      this.empModel.countDocuments(filter),
    ]);

    return { list, total, page, page_size: pageSize };
  }

  async create(dto: CreateEmployeeDto) {
    const exists = await this.empModel.findOne({ employee_no: dto.employee_no });
    if (exists) throw new ConflictException('工号已存在');
    const doc = await this.empModel.create(dto);
    return { id: doc._id };
  }

  async update(id: string, dto: UpdateEmployeeDto) {
    const record = await this.empModel.findById(id);
    if (!record) throw new NotFoundException('员工不存在');

    if (dto.employee_no && dto.employee_no !== record.employee_no) {
      const dup = await this.empModel.findOne({ employee_no: dto.employee_no });
      if (dup) throw new ConflictException('工号已存在');
    }

    Object.assign(record, dto);
    await record.save();
    return { id: record._id };
  }

  async remove(id: string) {
    const record = await this.empModel.findById(id);
    if (!record) throw new NotFoundException('员工不存在');
    await this.empModel.deleteOne({ _id: id });
    return { id };
  }
}

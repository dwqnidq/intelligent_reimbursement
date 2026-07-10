import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Company } from '../../schemas/company.schema';
import { User } from '../../schemas/user.schema';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

@Injectable()
export class CompanyService {
  constructor(
    @InjectModel(Company.name) private companyModel: Model<Company>,
    @InjectModel(User.name) private userModel: Model<User>,
  ) {}

  private async assertAdmin(userId: string) {
    const user = await this.userModel.findById(userId).populate('roles');
    const roles = user?.roles as unknown as { name: string }[];
    const isAdmin = roles?.some((r) => r.name === 'admin') ?? false;
    if (!isAdmin) throw new ForbiddenException('仅管理员可操作');
  }

  async findNameOptions() {
    return this.companyModel
      .find()
      .select('_id name')
      .sort({ name: 1 })
      .lean();
  }

  async findAll(userId: string) {
    await this.assertAdmin(userId);
    return this.companyModel.find().sort({ name: 1 });
  }

  async create(userId: string, dto: CreateCompanyDto) {
    await this.assertAdmin(userId);
    const name = dto.name.trim();
    const exists = await this.companyModel.findOne({ name });
    if (exists) throw new ConflictException('公司名称已存在');
    const doc = await this.companyModel.create({ name });
    return { id: doc._id };
  }

  async update(userId: string, id: string, dto: UpdateCompanyDto) {
    await this.assertAdmin(userId);
    const record = await this.companyModel.findById(id);
    if (!record) throw new NotFoundException('公司不存在');

    if (dto.name) {
      const name = dto.name.trim();
      const exists = await this.companyModel.findOne({
        name,
        _id: { $ne: id },
      });
      if (exists) throw new ConflictException('公司名称已存在');
      record.name = name;
      await this.userModel.updateMany(
        { company_id: id },
        { $set: { company_name: name } },
      );
    }

    await record.save();
    return { id: record._id };
  }

  async remove(userId: string, id: string) {
    await this.assertAdmin(userId);
    const record = await this.companyModel.findById(id);
    if (!record) throw new NotFoundException('公司不存在');

    const userCount = await this.userModel.countDocuments({ company_id: id });
    if (userCount > 0) {
      throw new BadRequestException('该公司下还有用户，无法删除');
    }

    await this.companyModel.deleteOne({ _id: id });
    return { id };
  }

  async findByIdOrFail(id: string) {
    const company = await this.companyModel.findById(id);
    if (!company) throw new NotFoundException('公司不存在');
    return company;
  }
}

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../../schemas/user.schema';
import { Employee } from '../../schemas/employee.schema';
import { Department } from '../../schemas/department.schema';
import { UserService } from '../user/user.service';
import { FeishuApiClient } from './feishu-api.client';

export type ProfileGap = 'payment_account' | 'company';

@Injectable()
export class FeishuIdentityService {
  constructor(
    private readonly userService: UserService,
    private readonly feishuApi: FeishuApiClient,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Employee.name) private readonly employeeModel: Model<Employee>,
    @InjectModel(Department.name) private readonly departmentModel: Model<Department>,
  ) {}

  async resolveUser(openId: string): Promise<User> {
    const profile = await this.feishuApi.getUserByOpenId(openId);
    return this.userService.ensureUserFromFeishuOpenId({
      openId,
      name: profile.name,
      email: profile.email,
      mobile: profile.mobile,
      avatar_url: profile.avatar_url,
    });
  }

  getProfileGaps(user: User): ProfileGap[] {
    const gaps: ProfileGap[] = [];
    if (!(user.payment_account ?? '').trim()) {
      gaps.push('payment_account');
    }
    if (!(user.company_id ?? '').trim() || !(user.company_name ?? '').trim()) {
      gaps.push('company');
    }
    return gaps;
  }

  async resolveDepartmentName(userId: string): Promise<string> {
    const employee = await this.employeeModel
      .findOne({ uid: userId })
      .select('dept_id')
      .lean();
    if (employee?.dept_id) {
      const dept = await this.departmentModel
        .findById(employee.dept_id)
        .select('name')
        .lean();
      if (dept?.name) return dept.name;
    }
    const user = await this.userModel.findById(userId).select('department').lean();
    const deptName = (user?.department ?? '').trim();
    return deptName || '未分配';
  }
}

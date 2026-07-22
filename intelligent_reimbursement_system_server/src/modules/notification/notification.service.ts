import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Notification } from '../../schemas/notification.schema';

@Injectable()
export class NotificationService {
  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<Notification>,
  ) {}

  async createIfAbsent(input: {
    user_id: string;
    type: string;
    title: string;
    body: string;
    payload?: Record<string, unknown>;
    idempotency_key: string;
  }): Promise<Notification | null> {
    try {
      return await this.notificationModel.create({
        user_id: input.user_id,
        type: input.type,
        title: input.title,
        body: input.body,
        payload: input.payload ?? {},
        read: false,
        idempotency_key: input.idempotency_key,
      });
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code;
      if (code === 11000) return null; // duplicate key
      throw err;
    }
  }

  /** 删除某审批记录相关站内通知幂等键，便于撤回后重新推送 */
  async deleteByIdempotencyKeyRegex(pattern: RegExp): Promise<number> {
    const res = await this.notificationModel.deleteMany({
      idempotency_key: { $regex: pattern },
    });
    return res.deletedCount ?? 0;
  }

  async listMine(userId: string, unreadOnly = false) {
    const filter: Record<string, unknown> = { user_id: userId };
    if (unreadOnly) filter.read = false;
    return this.notificationModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
  }

  async unreadCount(userId: string) {
    return this.notificationModel.countDocuments({
      user_id: userId,
      read: false,
    });
  }

  async markRead(id: string, userId: string) {
    await this.notificationModel.updateOne(
      { _id: id, user_id: userId },
      { $set: { read: true } },
    );
    return { id, read: true };
  }

  async markAllRead(userId: string) {
    const res = await this.notificationModel.updateMany(
      { user_id: userId, read: false },
      { $set: { read: true } },
    );
    return { modified: res.modifiedCount };
  }
}

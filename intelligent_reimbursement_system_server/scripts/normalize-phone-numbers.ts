/**
 * 一次性脚本：将 users / employees / feishu_users 中的手机号归一化为纯号码。
 *
 * 用法（在 intelligent_reimbursement_system_server 目录下）：
 *   npx ts-node -r tsconfig-paths/register scripts/normalize-phone-numbers.ts
 */
import mongoose from 'mongoose';
import { normalizePhone } from '../src/common/phone.util';

const MONGODB_URI =
  process.env.MONGODB_URI || 'mongodb://localhost:27017/Reimbursement';

async function normalizeCollection(
  db: mongoose.mongo.Db,
  collectionName: string,
  field: string,
): Promise<number> {
  const collection = db.collection(collectionName);
  const cursor = collection.find({ [field]: { $exists: true, $nin: ['', null] } });
  let updated = 0;

  for await (const doc of cursor) {
    const raw = String(doc[field] ?? '');
    const normalized = normalizePhone(raw);
    if (normalized && normalized !== raw) {
      await collection.updateOne({ _id: doc._id }, { $set: { [field]: normalized } });
      updated += 1;
    }
  }

  return updated;
}

async function main() {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('MongoDB 连接失败');
  }

  const userUpdated = await normalizeCollection(db, 'users', 'phone');
  const employeeUpdated = await normalizeCollection(db, 'employees', 'phone');
  const feishuUpdated = await normalizeCollection(db, 'feishu_users', 'mobile');

  console.log('手机号归一化完成:');
  console.log(`  users.phone: ${userUpdated} 条`);
  console.log(`  employees.phone: ${employeeUpdated} 条`);
  console.log(`  feishu_users.mobile: ${feishuUpdated} 条`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

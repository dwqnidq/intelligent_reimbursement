/**
 * 一次性脚本：修复 files 集合中 original_name 的 UTF-8 乱码。
 *
 * 用法（在 intelligent_reimbursement_system_server 目录下）：
 *   pnpm run migrate:fix-file-original-names
 */
import mongoose from 'mongoose';
import {
  decodeUploadedFilename,
  isGarbledUploadedFilename,
} from '../src/common/filename.util';

const MONGODB_URI =
  process.env.MONGODB_URI || 'mongodb://localhost:27017/Reimbursement';

async function main() {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('MongoDB 连接失败');
  }

  const collection = db.collection('files');
  const cursor = collection.find({
    original_name: { $exists: true, $nin: ['', null] },
  });

  let scanned = 0;
  let updated = 0;

  for await (const doc of cursor) {
    scanned += 1;
    const raw = String(doc.original_name ?? '');
    if (!isGarbledUploadedFilename(raw)) {
      continue;
    }

    const fixed = decodeUploadedFilename(raw);
    await collection.updateOne(
      { _id: doc._id },
      { $set: { original_name: fixed } },
    );
    updated += 1;
    console.log(`  修复: "${raw}" -> "${fixed}"`);
  }

  console.log('files.original_name 乱码修复完成:');
  console.log(`  扫描: ${scanned} 条`);
  console.log(`  更新: ${updated} 条`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

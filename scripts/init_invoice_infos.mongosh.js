/**
 * 初始化 invoice_infos 集合与唯一索引（mongosh 执行）
 * 用法: mongosh "mongodb://localhost:27017/Reimbursement" scripts/init_invoice_infos.mongosh.js
 */
const collName = 'invoice_infos';

if (!db.getCollectionNames().includes(collName)) {
  db.createCollection(collName);
  print(`已创建集合 ${collName}`);
} else {
  print(`集合 ${collName} 已存在`);
}

db[collName].createIndex(
  { invoice_number: 1 },
  { unique: true, name: 'invoice_number_unique' },
);

print(`invoice_infos 文档数: ${db[collName].countDocuments()}`);
printjson(db[collName].getIndexes());

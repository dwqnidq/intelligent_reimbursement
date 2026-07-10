/**
 * 根据业务下拉选项初始化报销类型（mongosh 执行）
 * 用法: mongosh "mongodb://localhost:27017/Reimbursement" scripts/seed_reimbursement_types.mongosh.js
 */
const amountField = {
  key: 'amount',
  label: '金额',
  type: 'number',
  required: true,
  options: [],
  sort: 0,
  is_calculate: true,
};

const types = [
  { code: 'office_expense', label: '办公费', name: '办公费' },
  { code: 'petty_cash_writeoff', label: '备用金核销', name: '备用金核销' },
  { code: 'travel_fee', label: '差旅费', name: '差旅费' },
  { code: 'accommodation_fee', label: '住宿费', name: '住宿费' },
  { code: 'transportation_fee', label: '交通费', name: '交通费' },
  { code: 'entertainment_fee', label: '招待费', name: '招待费' },
  { code: 'team_building_fee', label: '团建费', name: '团建费' },
  { code: 'communication_fee', label: '通讯费', name: '通讯费' },
  { code: 'express_delivery_fee', label: '快递费', name: '快递费' },
  { code: 'welfare_fee', label: '福利费', name: '餐费报销' },
  { code: 'other_expense', label: '其他', name: '其他' },
];

const coll = db.reimbursement_types;
const now = new Date();

// 先清理旧 code 及多余福利费，避免 name 唯一索引冲突
const removed = coll.deleteMany({
  $or: [
    { code: 'meal_reimbursement' },
    { label: '福利费', code: { $ne: 'welfare_fee' } },
  ],
});
if (removed.deletedCount > 0) {
  print(`已清理旧/重复福利费类型 ${removed.deletedCount} 条`);
}

let upserted = 0;
let modified = 0;

for (const t of types) {
  const res = coll.updateOne(
    { code: t.code },
    {
      $set: {
        code: t.code,
        label: t.label,
        name: t.name,
        fields: [amountField],
        export_fields: [],
        formula: 'amount',
        status: 1,
        over_limit_threshold: null,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  );
  if (res.upsertedCount) upserted += 1;
  if (res.modifiedCount) modified += 1;
}

print(`报销类型种子完成: 新增 ${upserted} 条, 更新 ${modified} 条, 共 ${types.length} 种`);
printjson(
  coll
    .find(
      { code: { $in: types.map((x) => x.code) } },
      { code: 1, name: 1, label: 1, 'fields.key': 1 },
    )
    .sort({ code: 1 })
    .toArray(),
);

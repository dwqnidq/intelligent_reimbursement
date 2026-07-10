/**
 * 初始化公司与管理员菜单（mongosh 执行）
 * 用法: mongosh "mongodb://localhost:27017/Reimbursement" scripts/seed_companies.mongosh.js
 */
const companyNames = [
  '浮力创新(深圳)科技有限公司',
  '福来数创（北京）智能科技有限公司',
];

const companies = db.companies;
const menus = db.menus;
const roles = db.roles;
const now = new Date();

for (const name of companyNames) {
  companies.updateOne(
    { name },
    { $setOnInsert: { name, createdAt: now, updatedAt: now } },
    { upsert: true },
  );
}

const menuRes = menus.updateOne(
  { path: '/company' },
  {
    $set: {
      name: '公司管理',
      path: '/company',
      component: 'CompanyManage',
      icon: 'BankOutlined',
      sort: 14,
      type: 'menu',
      parent_id: null,
      visible: 1,
      status: 1,
      updatedAt: now,
    },
    $setOnInsert: { createdAt: now },
  },
  { upsert: true },
);

const companyMenu = menus.findOne({ path: '/company' });
if (companyMenu?._id) {
  const adminRole = roles.findOne({ name: 'admin' });
  if (adminRole) {
    const menuId = String(companyMenu._id);
    const currentMenus = (adminRole.menus || []).map(String);
    if (!currentMenus.includes(menuId)) {
      roles.updateOne(
        { _id: adminRole._id },
        { $set: { menus: [...currentMenus, menuId], updatedAt: now } },
      );
      print('已将「公司管理」菜单加入 admin 角色');
    }
  } else {
    print('未找到 admin 角色，请手动在角色管理中分配公司管理菜单');
  }
}

print(`公司种子完成，共 ${companies.countDocuments()} 条`);
printjson(companies.find({}, { name: 1 }).sort({ name: 1 }).toArray());

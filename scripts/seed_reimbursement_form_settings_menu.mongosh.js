/**
 * 初始化「报销单填写方式」菜单并挂到 admin 角色（mongosh 执行）
 * 用法: mongosh "mongodb://localhost:27017/Reimbursement" scripts/seed_reimbursement_form_settings_menu.mongosh.js
 */
const menus = db.menus;
const roles = db.roles;
const now = new Date();

const MENU_PATH = '/reimbursement-form-settings';

const menuRes = menus.updateOne(
  { path: MENU_PATH },
  {
    $set: {
      name: '报销单填写方式',
      path: MENU_PATH,
      component: 'ReimbursementFormSettingsManage',
      icon: 'SettingOutlined',
      sort: 16,
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

print(`菜单 upsert: matched=${menuRes.matchedCount}, modified=${menuRes.modifiedCount}, upserted=${menuRes.upsertedCount}`);

const settingsMenu = menus.findOne({ path: MENU_PATH });
if (!settingsMenu?._id) {
  print('错误：未找到刚写入的菜单');
  quit(1);
}

printjson({
  _id: settingsMenu._id,
  name: settingsMenu.name,
  path: settingsMenu.path,
  component: settingsMenu.component,
});

const adminRole = roles.findOne({ name: 'admin' });
if (!adminRole) {
  print('未找到 admin 角色，请手动在角色管理中分配「报销单填写方式」菜单');
  quit(0);
}

const menuId = String(settingsMenu._id);
const currentMenus = (adminRole.menus || []).map(String);
if (currentMenus.includes(menuId)) {
  print('admin 角色已包含该菜单，无需更新');
} else {
  roles.updateOne(
    { _id: adminRole._id },
    { $set: { menus: [...currentMenus, menuId], updatedAt: now } },
  );
  print('已将「报销单填写方式」菜单加入 admin 角色');
}

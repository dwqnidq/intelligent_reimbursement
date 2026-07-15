/** 菜单节点（仅同步菜单树所需字段） */
export type MenuNodeForSync = {
  _id: string;
  parent_id?: string | null;
  permission?: string | null;
};

/**
 * 根据角色权限 ID 同步菜单：
 * - 保留未绑定权限的既有菜单（手工挂目录等）
 * - 权限绑定菜单：仅保留 permission 仍在 permissionIds 中的，并补齐祖先节点
 */
export function syncRoleMenuIds(
  existingMenuIds: string[],
  permissionIds: string[],
  menus: MenuNodeForSync[],
): string[] {
  const byId = new Map(menus.map((m) => [String(m._id), m]));
  const permSet = new Set(permissionIds.map(String));

  const result = new Set<string>();

  for (const id of existingMenuIds.map(String)) {
    const menu = byId.get(id);
    if (!menu) continue;
    if (!menu.permission) {
      result.add(id);
    }
  }

  for (const menu of menus) {
    if (!menu.permission || !permSet.has(String(menu.permission))) continue;
    let current: MenuNodeForSync | undefined = menu;
    while (current) {
      result.add(String(current._id));
      current = current.parent_id
        ? byId.get(String(current.parent_id))
        : undefined;
    }
  }

  return [...result];
}

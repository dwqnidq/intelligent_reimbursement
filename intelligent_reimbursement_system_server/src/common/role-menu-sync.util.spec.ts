import { syncRoleMenuIds } from './role-menu-sync.util';

describe('syncRoleMenuIds', () => {
  const menus = [
    { _id: 'dir', parent_id: null, permission: null },
    { _id: 'page', parent_id: 'dir', permission: 'perm-a' },
    { _id: 'other', parent_id: 'dir', permission: 'perm-b' },
    { _id: 'orphan', parent_id: null, permission: null },
  ];

  it('adds permission-linked menus and their ancestors', () => {
    const result = syncRoleMenuIds(['orphan'], ['perm-a'], menus);
    expect(result.sort()).toEqual(['dir', 'orphan', 'page'].sort());
  });

  it('drops menus whose permission was removed', () => {
    const result = syncRoleMenuIds(
      ['dir', 'page', 'other', 'orphan'],
      ['perm-a'],
      menus,
    );
    expect(result.sort()).toEqual(['dir', 'orphan', 'page'].sort());
    expect(result).not.toContain('other');
  });

  it('keeps unbound menus even when no permissions selected', () => {
    const result = syncRoleMenuIds(['orphan', 'page'], [], menus);
    expect(result).toEqual(['orphan']);
  });
});

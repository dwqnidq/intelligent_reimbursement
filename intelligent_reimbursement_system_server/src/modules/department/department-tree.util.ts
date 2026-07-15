/** 部门树节点输入（兼容 plain object 与 mongoose Document） */
export type DepartmentTreeInput = {
  _id: unknown;
  parent_id?: unknown;
  toObject?: () => Record<string, unknown>;
};

export type DepartmentTreeNode = Record<string, unknown> & {
  children?: DepartmentTreeNode[];
};

/** 从 string / populate 对象中解析上级部门 id */
export function resolveDepartmentParentId(parentId: unknown): string | null {
  if (parentId == null || parentId === '') return null;
  if (typeof parentId === 'string') return parentId;
  if (typeof parentId === 'object' && parentId !== null && '_id' in parentId) {
    const id = (parentId as { _id: unknown })._id;
    return id == null || id === '' ? null : String(id);
  }
  return String(parentId);
}

/**
 * 将扁平部门列表组装为树。
 * 兼容 parent_id 为 string 或 populate 后的 `{ _id, name, code }`。
 */
export function buildDepartmentTree(
  departments: DepartmentTreeInput[],
  parentId: string | null = null,
): DepartmentTreeNode[] {
  const targetParentId = parentId ?? null;
  return departments
    .filter(
      (dept) => resolveDepartmentParentId(dept.parent_id) === targetParentId,
    )
    .map((dept) => {
      const base =
        typeof dept.toObject === 'function'
          ? dept.toObject()
          : { ...(dept as Record<string, unknown>) };
      const children = buildDepartmentTree(departments, String(dept._id));
      return children.length > 0 ? { ...base, children } : { ...base };
    });
}

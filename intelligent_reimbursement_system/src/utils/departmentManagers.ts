import {
  flattenDepartments,
  type Department,
} from "../api/department";

export type DepartmentManagerOption = {
  _id: string;
  name: string;
  avatar?: string;
  position?: string;
  /** 所负责部门名，多人共用时以顿号拼接 */
  deptNames: string;
};

/**
 * 从部门列表（可含树）收集启用部门的负责人，供审批流选人。
 * @param nameFilter 可选，按负责人姓名模糊过滤
 */
export function collectDepartmentManagers(
  departments: Department[],
  nameFilter?: string,
): DepartmentManagerOption[] {
  const byId = new Map<string, DepartmentManagerOption>();
  for (const dept of flattenDepartments(departments)) {
    if (dept.status !== 1) continue;
    const manager = dept.manager_id;
    if (!manager?._id) continue;
    const existing = byId.get(manager._id);
    if (existing) {
      if (!existing.deptNames.split("、").includes(dept.name)) {
        existing.deptNames = `${existing.deptNames}、${dept.name}`;
      }
      continue;
    }
    byId.set(manager._id, {
      _id: manager._id,
      name: manager.name,
      avatar: manager.avatar,
      position: manager.position,
      deptNames: dept.name,
    });
  }

  let list = [...byId.values()];
  const keyword = nameFilter?.trim();
  if (keyword) {
    list = list.filter((m) => m.name.includes(keyword));
  }
  return list;
}

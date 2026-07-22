/** 与后端 AI / 公司管理等一致：仅 role.name === 'admin' 为系统管理员 */
export function isSystemAdmin(roles: string[] | undefined | null): boolean {
  return Boolean(roles?.includes("admin"));
}

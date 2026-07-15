/** 飞书部门负责人解析与补写判断 */
export type FeishuContactUserProfile = {
  open_id: string;
  name?: string;
  email?: string;
  mobile?: string;
  avatar_url?: string;
};

/**
 * 从飞书「获取单个用户」接口响应中解析用户资料。
 * 失败或缺少 user 时返回 undefined。
 */
export function parseFeishuContactUserResponse(
  openId: string,
  body: {
    code?: number;
    data?: {
      user?: {
        name?: string;
        email?: string;
        mobile?: string;
        avatar?: { avatar_origin?: string };
        avatar_url?: string;
      };
    };
  },
): FeishuContactUserProfile | undefined {
  if (body.code !== 0 || !body.data?.user) return undefined;
  const user = body.data.user;
  return {
    open_id: openId,
    name: user.name,
    email: user.email,
    mobile: user.mobile,
    avatar_url: user.avatar_url || user.avatar?.avatar_origin,
  };
}

/**
 * 已有部门是否应补写负责人：仅当本地尚无 manager_id，且已解析出负责人员工 id。
 * 不覆盖人工已设置的负责人。
 */
export function shouldBackfillDepartmentManager(params: {
  existingManagerId?: string | null;
  resolvedManagerEmployeeId?: string;
}): boolean {
  const existing = (params.existingManagerId ?? '').trim();
  const resolved = (params.resolvedManagerEmployeeId ?? '').trim();
  return !existing && !!resolved;
}

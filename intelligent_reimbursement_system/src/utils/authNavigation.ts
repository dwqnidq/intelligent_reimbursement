import type { UserInfo, MenuItem } from "../api/user";

export function findFirstMenuPath(menus: MenuItem[]): string | null {
  for (const m of menus) {
    if (m.path) return m.path;
    if (m.children?.length) {
      const found = findFirstMenuPath(m.children);
      if (found) return found;
    }
  }
  return null;
}

export function needsProfileSetup(user: UserInfo | null | undefined): boolean {
  return Boolean(
    user &&
      (!user.company_id?.trim() ||
        !user.company_name?.trim() ||
        !user.payment_account?.trim()),
  );
}

/** @deprecated 使用 needsProfileSetup */
export function needsPaymentAccountSetup(user: UserInfo | null | undefined): boolean {
  return needsProfileSetup(user);
}

export function resolvePostLoginPath(
  user: UserInfo,
  menus: MenuItem[],
  from?: string | null,
): string {
  if (user.password_login_enabled === false) return "/password-setup";
  if (needsProfileSetup(user)) return "/profile-setup";
  return from ?? findFirstMenuPath(menus) ?? "/";
}

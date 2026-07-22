import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/useAuthStore";
import http from "../api/http";
import type { MenuItem } from "../api/user";
import { resolvePostLoginPath } from "../utils/authNavigation";

export default function SetTokenPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  useEffect(() => {
    (async () => {
      try {
        const res = await http.get<{
          token: string;
          refreshToken: string;
          user: {
            id: string;
            username: string;
            real_name: string;
            email: string;
            avatar: string;
            password_login_enabled?: boolean;
            payment_account?: string;
          };
          permissions: string[];
          roles?: string[];
          menus: MenuItem[];
        }>("/users/auth/feishu/session");
        setAuth({
          token: res.token ?? "",
          refreshToken: res.refreshToken ?? "",
          user: res.user,
          permissions: res.permissions,
          roles: res.roles ?? [],
          menus: res.menus,
        });
        window.location.replace(resolvePostLoginPath(res.user, res.menus));
      } catch {
        navigate("/login", { replace: true });
      }
    })();
  }, [navigate, setAuth]);

  return (
    <div className="min-h-screen bg-[var(--bg-page)] flex flex-col items-center justify-center gap-3">
      <div className="w-8 h-8 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
      <p className="text-[var(--text-secondary)] text-sm">正在登录，请稍候...</p>
    </div>
  );
}

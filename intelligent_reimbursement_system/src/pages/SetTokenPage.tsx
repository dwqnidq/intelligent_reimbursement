import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/useAuthStore";
import http from "../api/http";

export default function SetTokenPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  useEffect(() => {
    (async () => {
      try {
        // 纯 Cookie 模式：依赖浏览器自动携带 access_token
        const res = await http.get<{
          token: string;
          user: {
            id: string;
            username: string;
            real_name: string;
            email: string;
            avatar: string;
          };
          permissions: string[];
          menus: unknown[];
        }>("/users/auth/feishu/session");
        setAuth({
          token: res.token ?? "",
          user: res.user,
          permissions: res.permissions,
          menus: res.menus as never,
        });
      } catch {
        navigate("/login", { replace: true });
        return;
      }

      // 替换历史记录，避免保留中转页
      window.location.replace("/");
    })();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-400 text-sm">正在登录，请稍候...</p>
    </div>
  );
}

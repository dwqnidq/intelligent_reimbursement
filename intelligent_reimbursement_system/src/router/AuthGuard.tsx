import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../store/useAuthStore";
import { useEffect, useState, type ReactNode } from "react";
import { getAuthSession } from "../api/user";
import { Spin } from "antd";

interface Props {
  children: ReactNode;
}

/**
 * 有 token 时在挂载时拉取一次最新权限/菜单。
 * 避免仅依赖登录时写入的 localStorage 缓存导致角色变更不生效。
 */
export default function AuthGuard({ children }: Props) {
  const token = useAuthStore((s) => s.token);
  const setAuth = useAuthStore((s) => s.setAuth);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const location = useLocation();
  const [ready, setReady] = useState(() => !token);

  useEffect(() => {
    const currentToken = useAuthStore.getState().token;
    if (!currentToken) {
      setReady(true);
      return;
    }

    let cancelled = false;
    getAuthSession()
      .then((res) => {
        if (cancelled) return;
        setAuth({
          token: res.token,
          refreshToken: res.refreshToken,
          user: res.user,
          permissions: res.permissions,
          menus: res.menus,
        });
      })
      .catch(() => {
        if (cancelled) return;
        clearAuth();
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
    // 仅挂载时刷新一次，避免 setAuth 换 token 后再次请求形成循环
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spin size="large" tip="加载会话…" />
      </div>
    );
  }

  return <>{children}</>;
}

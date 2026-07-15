import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import { UserProvider } from "./context/UserContext";
import { useAuthStore } from "./store/useAuthStore";
import { appTheme } from "./theme/antdTheme";
import AuthGuard from "./router/AuthGuard";
import MainLayout from "./layouts/MainLayout";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import SetTokenPage from "./pages/SetTokenPage";
import PasswordSetupPage from "./pages/PasswordSetupPage";
import ProfileSetupPage from "./pages/ProfileSetupPage";
import AIAssistant from "./components/AIAssistant";
import { componentMap } from "./router/componentMap";
import type { MenuItem } from "./api/user";

dayjs.locale("zh-cn");

function flatMenus(menus: MenuItem[]): MenuItem[] {
  return menus.flatMap((m) => [m, ...flatMenus(m.children ?? [])]);
}

function findFirstPath(items: MenuItem[]): string | null {
  for (const m of items) {
    if (m.path) return m.path;
    if (m.children?.length) {
      const found = findFirstPath(m.children);
      if (found) return found;
    }
  }
  return null;
}

function IndexRedirect() {
  const menus = useAuthStore((s) => s.menus);
  const firstPath = findFirstPath(menus) ?? "/dashboard";
  return <Navigate to={firstPath} replace />;
}

function AIAssistantGuard() {
  const { token, permissions } = useAuthStore();
  // 未登录不显示
  if (!token) return null;
  // 无任何权限（普通用户）不显示
  if (!permissions || permissions.length === 0) return null;
  return <AIAssistant />;
}

export default function App() {
  const menus = useAuthStore((s) => s.menus);
  const allMenus = flatMenus(menus);

  const dynamicRoutes = allMenus
    .filter((m) => m.path && m.component && componentMap[m.component])
    .map((m) => {
      const Component = componentMap[m.component!];
      const path = m.path!.replace(/^\//, "");
      return <Route key={m._id} path={path} element={<Component />} />;
    });

  return (
    <ConfigProvider locale={zhCN} theme={appTheme}>
      <UserProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/set-token" element={<SetTokenPage />} />
            <Route
              path="/password-setup"
              element={
                <AuthGuard>
                  <PasswordSetupPage />
                </AuthGuard>
              }
            />
            <Route
              path="/profile-setup"
              element={
                <AuthGuard>
                  <ProfileSetupPage />
                </AuthGuard>
              }
            />
            <Route
              path="/payment-account-setup"
              element={<Navigate to="/profile-setup" replace />}
            />
            <Route
              path="/"
              element={
                <AuthGuard>
                  <MainLayout />
                </AuthGuard>
              }
            >
              <Route index element={<IndexRedirect />} />
              {dynamicRoutes}
              <Route path="*" element={<IndexRedirect />} />
            </Route>
          </Routes>
          <AIAssistantGuard />
        </BrowserRouter>
      </UserProvider>
    </ConfigProvider>
  );
}

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import { UserProvider } from "./context/UserContext";
import { useAuthStore } from "./store/useAuthStore";
import AuthGuard from "./router/AuthGuard";
import MainLayout from "./layouts/MainLayout";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
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
    <ConfigProvider locale={zhCN}>
      <UserProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
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
            </Route>
          </Routes>
          <AIAssistant />
        </BrowserRouter>
      </UserProvider>
    </ConfigProvider>
  );
}

import { useState, useEffect } from "react";
import { Layout, Menu, Button, Drawer, Avatar, Dropdown, Modal } from "antd";
import type { MenuProps } from "antd";
import {
  MenuOutlined,
  MoneyCollectOutlined,
  UserOutlined,
  LogoutOutlined,
  BellOutlined,
} from "@ant-design/icons";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { useAuthStore } from "../store/useAuthStore";
import { iconMap } from "../router/iconMap";
import type { MenuItem } from "../api/user";

const { Header, Sider, Content } = Layout;

function buildMenuItems(menus: MenuItem[]): MenuProps["items"] {
  return menus
    .filter((m) => m.visible === 1)
    .sort((a, b) => a.sort - b.sort)
    .map((m) => ({
      key: m.path ?? m._id,
      icon: iconMap[m.icon] ?? null,
      label: m.name,
      children: m.children?.length ? buildMenuItems(m.children) : undefined,
    }));
}

export default function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, menus } = useAuthStore();
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const menuItems = buildMenuItems(menus);

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key);
    setDrawerOpen(false);
  };

  const currentLabel =
    menus.find((m) => m.path === location.pathname)?.name ?? "报销管理系统";

  const handleLogout = () => {
    Modal.confirm({
      title: "退出登录",
      content: "确定要退出登录吗？",
      okText: "确定",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: () => {
        clearAuth();
        navigate("/login", { replace: true });
      },
    });
  };

  const userMenuItems: MenuProps["items"] = [
    {
      key: "profile",
      icon: <UserOutlined />,
      label: "个人信息",
      onClick: () => navigate("/profile"),
    },
    { type: "divider" },
    {
      key: "logout",
      icon: <LogoutOutlined />,
      label: <span className="text-red-500">退出登录</span>,
      onClick: handleLogout,
    },
  ];

  const sideMenu = (
    <Menu
      mode="inline"
      selectedKeys={[location.pathname]}
      items={menuItems}
      onClick={handleMenuClick}
      className="h-full border-none"
    />
  );

  const logo = (
    <div className="flex items-center gap-2.5 px-5 py-5 border-b border-[var(--border-color)]">
      <MoneyCollectOutlined style={{ color: "var(--color-primary)", fontSize: 20 }} />
      <span className="font-semibold text-[var(--text-primary)] text-sm">
        报销管理系统
      </span>
    </div>
  );

  return (
    <Layout style={{ height: "100vh" }}>
      {!isMobile && (
        <Sider width={224} theme="light">
          {logo}
          {sideMenu}
        </Sider>
      )}

      <Drawer
        placement="left"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        size="default"
        styles={{ body: { padding: 0 } }}
        title={
          <div className="flex items-center gap-2.5">
            <MoneyCollectOutlined style={{ color: "var(--color-primary)", fontSize: 18 }} />
            <span className="text-sm font-semibold">报销管理系统</span>
          </div>
        }
      >
        {sideMenu}
      </Drawer>

      <Layout style={{ overflow: "hidden" }}>
        <Header
          style={{
            height: 56,
            lineHeight: "56px",
            padding: "0 24px",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: 12,
            background: "var(--bg-header)",
            borderBottom: "none",
            boxShadow: "var(--shadow-header)",
          }}
        >
          {isMobile && (
            <Button
              type="text"
              icon={<MenuOutlined />}
              onClick={() => setDrawerOpen(true)}
              className="flex items-center justify-center"
            />
          )}
          <span className="font-semibold text-[var(--text-primary)] text-[15px]">
            {currentLabel}
          </span>

          <div className="ml-auto flex items-center gap-2">
            <Button
              type="text"
              icon={<BellOutlined className="text-[var(--text-secondary)] text-base" />}
              className="flex items-center justify-center"
            />
            <Dropdown
              menu={{ items: userMenuItems }}
              placement="bottomRight"
              trigger={["click"]}
            >
              <div className="flex items-center gap-2.5 cursor-pointer px-3 py-1.5 rounded-xl hover:bg-[var(--bg-page)] transition-colors">
                <Avatar
                  size={30}
                  src={user?.avatar || undefined}
                  icon={!user?.avatar && <UserOutlined />}
                  className="bg-[var(--color-primary)]"
                />
                {!isMobile && (
                  <span className="text-sm text-[var(--text-primary)] select-none font-medium">
                    {user?.real_name ?? user?.username}
                  </span>
                )}
              </div>
            </Dropdown>
          </div>
        </Header>

        <Content
          className="p-4 md:p-6"
          style={{
            overflowY: "auto",
            flex: 1,
            minHeight: 0,
            background: "var(--bg-page)",
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}

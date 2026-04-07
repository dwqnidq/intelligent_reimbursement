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
    <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
      <MoneyCollectOutlined className="text-blue-500 text-xl" />
      <span className="font-semibold text-gray-800 text-sm">报销管理系统</span>
    </div>
  );

  return (
    <Layout style={{ height: "100vh" }}>
      {!isMobile && (
        <Sider width={220} theme="light" className="shadow-md">
          {logo}
          {sideMenu}
        </Sider>
      )}

      <Drawer
        placement="left"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={220}
        styles={{ body: { padding: 0 } }}
        title={
          <div className="flex items-center gap-2">
            <MoneyCollectOutlined className="text-blue-500" />
            <span className="text-sm font-semibold">报销管理系统</span>
          </div>
        }
      >
        {sideMenu}
      </Drawer>

      <Layout style={{ overflow: "hidden" }}>
        <Header
          className="bg-white shadow-sm flex items-center gap-3 px-4"
          style={{
            height: 52,
            lineHeight: "52px",
            padding: "0 16px",
            flexShrink: 0,
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
          <span className="font-medium text-gray-700 text-sm md:text-base">
            {currentLabel}
          </span>

          <div className="ml-auto flex items-center gap-2">
            <Button
              type="text"
              icon={<BellOutlined />}
              className="flex items-center justify-center"
            />
            <Dropdown
              menu={{ items: userMenuItems }}
              placement="bottomRight"
              trigger={["click"]}
            >
              <div className="flex items-center gap-2 cursor-pointer px-2 py-1 rounded-lg hover:bg-gray-50 transition-colors">
                <Avatar
                  size={30}
                  src={user?.avatar || undefined}
                  icon={!user?.avatar && <UserOutlined />}
                  className="bg-blue-500"
                />
                {!isMobile && (
                  <span className="text-sm text-gray-700 select-none">
                    {user?.real_name ?? user?.username}
                  </span>
                )}
              </div>
            </Dropdown>
          </div>
        </Header>

        <Content
          className="p-3 md:p-6 bg-gray-50 flex flex-col"
          style={{ overflowY: "auto", flex: 1, minHeight: 0 }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}

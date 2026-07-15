import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Layout,
  Menu,
  Button,
  Drawer,
  Avatar,
  Dropdown,
  Modal,
  Tooltip,
  Badge,
  Popover,
  List,
  Empty,
} from "antd";
import type { MenuProps } from "antd";
import {
  MenuOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MoneyCollectOutlined,
  UserOutlined,
  LogoutOutlined,
  BellOutlined,
} from "@ant-design/icons";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { useAuthStore } from "../store/useAuthStore";
import { useLayoutStore } from "../store/useLayoutStore";
import { needsProfileSetup } from "../utils/authNavigation";
import { iconMap } from "../router/iconMap";
import type { MenuItem } from "../api/user";
import {
  getMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from "../api/notification";

const { Header, Sider, Content } = Layout;

const SIDER_WIDTH = 232;
const SIDER_COLLAPSED_WIDTH = 72;

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

function findOpenKeys(menus: MenuItem[], pathname: string, prefix: string[] = []): string[] {
  for (const menu of menus) {
    if (menu.path === pathname) return prefix;
    if (menu.children?.length) {
      const found = findOpenKeys(menu.children, pathname, [...prefix, menu.path ?? menu._id]);
      if (found.length) return found;
    }
  }
  return [];
}

function findCurrentLabel(menus: MenuItem[], pathname: string): string | null {
  for (const menu of menus) {
    if (menu.path === pathname) return menu.name;
    if (menu.children?.length) {
      const found = findCurrentLabel(menu.children, pathname);
      if (found) return found;
    }
  }
  return null;
}

export default function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, menus } = useAuthStore();
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const sidebarCollapsed = useLayoutStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useLayoutStore((s) => s.toggleSidebar);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [openKeys, setOpenKeys] = useState<string[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = useCallback(() => {
    getMyNotifications()
      .then((data) => {
        setNotifications(data?.list ?? []);
        setUnreadCount(data?.unread ?? 0);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchNotifications();
    const timer = window.setInterval(fetchNotifications, 60_000);
    return () => window.clearInterval(timer);
  }, [fetchNotifications]);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  useEffect(() => {
    if (needsProfileSetup(user)) {
      navigate("/profile-setup", { replace: true });
    }
  }, [navigate, user]);

  const menuItems = buildMenuItems(menus);

  const activeOpenKeys = useMemo(
    () => findOpenKeys(menus, location.pathname),
    [menus, location.pathname],
  );

  useEffect(() => {
    if (!sidebarCollapsed) {
      setOpenKeys((prev) => Array.from(new Set([...prev, ...activeOpenKeys])));
    }
  }, [activeOpenKeys, sidebarCollapsed]);

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key);
    setDrawerOpen(false);
  };

  const currentLabel = findCurrentLabel(menus, location.pathname) ?? "报销管理系统";

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
      openKeys={sidebarCollapsed ? [] : openKeys}
      onOpenChange={setOpenKeys}
      inlineCollapsed={sidebarCollapsed}
      items={menuItems}
      onClick={handleMenuClick}
      className="app-side-menu border-none"
    />
  );

  const logo = (
    <div
      className={`app-logo flex items-center gap-2.5 border-b border-[var(--border-color)] transition-all ${
        sidebarCollapsed ? "justify-center px-3 py-4" : "px-5 py-5"
      }`}
    >
      <div className="app-logo-icon flex-shrink-0">
        <MoneyCollectOutlined />
      </div>
      {!sidebarCollapsed && (
        <div className="min-w-0">
          <div className="font-semibold text-[var(--text-primary)] text-sm leading-tight truncate">
            报销管理系统
          </div>
          <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5">智能报销平台</div>
        </div>
      )}
    </div>
  );

  return (
    <Layout className="app-shell" style={{ height: "100vh" }}>
      {!isMobile && (
        <Sider
          width={SIDER_WIDTH}
          collapsedWidth={SIDER_COLLAPSED_WIDTH}
          collapsed={sidebarCollapsed}
          className="app-sider"
          theme="light"
        >
          {logo}
          <div className="app-sider-menu flex-1 overflow-y-auto scrollbar-hide">{sideMenu}</div>
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
            <div className="app-logo-icon scale-90">
              <MoneyCollectOutlined />
            </div>
            <span className="text-sm font-semibold">报销管理系统</span>
          </div>
        }
      >
        {sideMenu}
      </Drawer>

      <Layout style={{ overflow: "hidden" }}>
        <Header className="app-header">
          <div className="flex items-center gap-2 min-w-0">
            {isMobile ? (
              <Button
                type="text"
                icon={<MenuOutlined />}
                onClick={() => setDrawerOpen(true)}
                className="flex items-center justify-center"
              />
            ) : (
              <Tooltip title={sidebarCollapsed ? "展开菜单" : "收起菜单"}>
                <Button
                  type="text"
                  icon={sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                  onClick={toggleSidebar}
                  className="app-header-trigger"
                />
              </Tooltip>
            )}
            <div className="min-w-0">
              <div className="font-semibold text-[var(--text-primary)] text-[15px] truncate">
                {currentLabel}
              </div>
              <div className="text-[11px] text-[var(--text-tertiary)] hidden sm:block">
                企业报销 · 智能审批
              </div>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Popover
              trigger="click"
              open={notifOpen}
              onOpenChange={(open) => {
                setNotifOpen(open);
                if (open) fetchNotifications();
              }}
              placement="bottomRight"
              content={
                <div style={{ width: 320, maxHeight: 400, overflow: "auto" }}>
                  <div className="flex items-center justify-between mb-2 px-1">
                    <span className="text-sm font-medium">消息通知</span>
                    <Button
                      type="link"
                      size="small"
                      disabled={unreadCount === 0}
                      onClick={() => {
                        void markAllNotificationsRead().then(fetchNotifications);
                      }}
                    >
                      全部已读
                    </Button>
                  </div>
                  {notifications.length === 0 ? (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description="暂无通知"
                    />
                  ) : (
                    <List
                      size="small"
                      dataSource={notifications}
                      renderItem={(item) => (
                        <List.Item
                          className="cursor-pointer !px-2"
                          onClick={() => {
                            if (!item.read) {
                              void markNotificationRead(item._id).then(
                                fetchNotifications,
                              );
                            }
                            navigate("/pending-approval");
                            setNotifOpen(false);
                          }}
                        >
                          <List.Item.Meta
                            title={
                              <span
                                className={
                                  item.read
                                    ? "text-[var(--text-secondary)]"
                                    : "font-medium"
                                }
                              >
                                {!item.read && (
                                  <Badge status="processing" className="mr-1" />
                                )}
                                {item.title}
                              </span>
                            }
                            description={
                              <span className="text-xs text-[var(--text-tertiary)]">
                                {item.body}
                              </span>
                            }
                          />
                        </List.Item>
                      )}
                    />
                  )}
                </div>
              }
            >
              <Badge count={unreadCount} size="small" offset={[-2, 2]}>
                <Button
                  type="text"
                  icon={<BellOutlined />}
                  className="flex items-center justify-center"
                />
              </Badge>
            </Popover>
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" trigger={["click"]}>
              <div className="flex items-center gap-2.5 cursor-pointer px-3 py-1.5 rounded-xl hover:bg-black/5 transition-colors">
                <Avatar
                  size={30}
                  src={user?.avatar || undefined}
                  icon={!user?.avatar && <UserOutlined />}
                  className="app-user-avatar"
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

        <Content className="app-content p-4 md:p-6">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}

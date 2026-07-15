import type { ThemeConfig } from "antd";

/** 飞书风格青绿主题 — 与报销卡片配色一致 */
export const appTheme: ThemeConfig = {
  token: {
    colorPrimary: "#0f766e",
    colorPrimaryHover: "#0d9488",
    colorPrimaryActive: "#115e59",
    colorLink: "#0f766e",
    colorLinkHover: "#0d9488",
    colorSuccess: "#16a34a",
    colorWarning: "#ea580c",
    colorError: "#dc2626",
    colorInfo: "#2563eb",
    borderRadius: 10,
    borderRadiusLG: 12,
    borderRadiusSM: 8,
    fontFamily:
      '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
    colorBgContainer: "#ffffff",
    colorBgLayout: "#f1f5f9",
    colorBorder: "#e2e8f0",
    colorText: "#0f172a",
    colorTextSecondary: "#64748b",
    boxShadow:
      "0 12px 40px rgba(15, 23, 42, 0.08), 0 2px 8px rgba(15, 23, 42, 0.04)",
    boxShadowSecondary: "0 2px 8px rgba(15, 23, 42, 0.06)",
  },
  components: {
    Layout: {
      siderBg: "#ffffff",
      headerBg: "#ffffff",
      bodyBg: "#f1f5f9",
    },
    Menu: {
      itemBorderRadius: 10,
      itemHeight: 40,
      itemMarginInline: 12,
      iconSize: 16,
      itemSelectedColor: "#115e59",
      itemSelectedBg: "#ffffff",
      itemHoverBg: "rgba(15, 118, 110, 0.05)",
      subMenuItemBg: "transparent",
    },
    Button: {
      primaryShadow: "0 2px 8px rgba(15, 118, 110, 0.25)",
    },
    Card: {
      borderRadiusLG: 14,
    },
    Table: {
      headerBg: "#f8fafc",
      headerColor: "#64748b",
      rowHoverBg: "#f0fdfa",
    },
  },
};

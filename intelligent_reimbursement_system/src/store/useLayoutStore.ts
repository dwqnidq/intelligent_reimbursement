import { create } from "zustand";
import { persist } from "zustand/middleware";

interface LayoutState {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
    }),
    { name: "layout-storage" },
  ),
);

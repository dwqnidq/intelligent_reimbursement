import { create } from "zustand";
import { persist } from "zustand/middleware";

const applyTheme = (isDark: boolean) => {
  document.documentElement.classList.toggle("dark", isDark);
};

// 初始跟随系统偏好
const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

interface ThemeState {
  isDark: boolean;
  toggle: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      isDark: systemDark,
      toggle: () => {
        const next = !get().isDark;
        applyTheme(next);
        set({ isDark: next });
      },
    }),
    {
      name: "theme-storage",
      onRehydrateStorage: () => (state) => {
        if (state) applyTheme(state.isDark);
      },
    },
  ),
);

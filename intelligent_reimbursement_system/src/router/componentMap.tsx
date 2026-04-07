import type { ComponentType } from "react";
import DashboardPage from "../pages/DashboardPage";
import ReimbursementForm from "../pages/ReimbursementForm";
import ReimbursementList from "../pages/ReimbursementList";
import ReimbursementTypeCreate from "../pages/ReimbursementTypeCreate";
import ProfilePage from "../pages/ProfilePage";

export const componentMap: Record<string, ComponentType> = {
  DashboardPage,
  ReimbursementForm,
  ReimbursementList,
  ReimbursementTypeCreate,
  ProfilePage,
};

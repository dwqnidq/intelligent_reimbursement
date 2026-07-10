import type { ComponentType } from "react";
import DashboardPage from "../pages/DashboardPage";
import ReimbursementForm from "../pages/ReimbursementForm";
import ReimbursementList from "../pages/ReimbursementList";
import ReimbursementTypeCreate from "../pages/ReimbursementTypeCreate";
import ProfilePage from "../pages/ProfilePage";
import OpinionPage from "../pages/OpinionPage";
import OpinionSubmitPage from "../pages/OpinionSubmitPage";
import DepartmentManage from "../pages/DepartmentManage";
import EmployeeManage from "../pages/EmployeeManage";
import ApprovalFlowManage from "../pages/ApprovalFlowManage";
import PendingApprovalPage from "../pages/PendingApprovalPage";
import ApprovalHistoryPage from "../pages/ApprovalHistoryPage";
import RoleManage from "../pages/RoleManage";
import PermissionManage from "../pages/PermissionManage";
import MenuManage from "../pages/MenuManage";
import CompanyManage from "../pages/CompanyManage";

export const componentMap: Record<string, ComponentType> = {
  DashboardPage,
  ReimbursementForm,
  ReimbursementList,
  ReimbursementTypeCreate,
  ProfilePage,
  OpinionPage,
  OpinionSubmitPage,
  DepartmentManage,
  EmployeeManage,
  ApprovalFlowManage,
  PendingApprovalPage,
  ApprovalHistoryPage,
  RoleManage,
  PermissionManage,
  MenuManage,
  CompanyManage,
};

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
};

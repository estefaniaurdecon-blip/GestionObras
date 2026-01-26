import React from "react";
import {
  createRouter,
  RouterProvider,
  Outlet,
  createRootRoute,
  createRoute,
} from "@tanstack/react-router";

import { LoginPage } from "./pages/LoginPage";
import { MFAVerifyPage } from "./pages/MFAVerifyPage";
import { DashboardPage } from "./pages/DashboardPage";
import { UsersPage } from "./pages/UsersPage";
import { ToolsAdminPage } from "./pages/ToolsAdminPage";
import { AuditLogPage } from "./pages/AuditLogPage";
import { TenantSettingsPage } from "./pages/TenantSettingsPage";
import { UserSettingsPage } from "./pages/UserSettingsPage";
import { TimeControlPage } from "./pages/TimeControlPage";
import { TimeReportPage } from "./pages/TimeReportPage";
import { SupportTicketsPage } from "./pages/SupportTicketsPage";
import { HrPage } from "./pages/HrPage";
import { AcceptInvitationPage } from "./pages/AcceptInvitationPage";
import { ErpProjectsPage } from "./pages/ErpProjectsPage";
import { ErpProjectDetailPage } from "./pages/ErpProjectDetailPage";
import { ErpTasksPage } from "./pages/ErpTasksPage";
import { ErpExternalCollaborationsPage } from "./pages/ErpExternalCollaborationsPage";
import { ErpSimulationsPage } from "./pages/ErpSimulationsPage";

// Layout raíz muy simple: delega en cada página.
const RootLayout: React.FC = () => <Outlet />;

// Ruta raíz del router.
const rootRoute = createRootRoute({
  component: RootLayout,
});

// Rutas hijas principales.
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: LoginPage,
});

const mfaRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/mfa",
  component: MFAVerifyPage,
});

const acceptInvitationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/accept-invitation",
  component: AcceptInvitationPage,
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dashboard",
  component: DashboardPage,
});

const usersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/users",
  component: UsersPage,
});

const toolsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tools",
  component: ToolsAdminPage,
});

const timeControlRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/time-control",
  component: TimeControlPage,
});

const erpProjectsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/erp/projects",
  component: ErpProjectsPage,
});

const erpProjectDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/erp/projects/$projectId",
  component: ErpProjectDetailPage,
});

const erpTasksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/erp/tasks",
  component: ErpTasksPage,
});

const erpExternalCollaborationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/erp/external-collaborations",
  component: ErpExternalCollaborationsPage,
});

const erpSimulationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/erp/simulations",
  component: ErpSimulationsPage,
});

const erpTimeControlRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/erp/time-control",
  component: TimeControlPage,
});

const erpTimeReportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/erp/time-report",
  component: TimeReportPage,
});

const timeReportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/time-report",
  component: TimeReportPage,
});

const auditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/audit",
  component: AuditLogPage,
});

const tenantSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tenant-settings",
  component: TenantSettingsPage,
});

const userSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/user-settings",
  component: UserSettingsPage,
});

const supportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/support",
  component: SupportTicketsPage,
});

const hrRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/hr",
  component: HrPage,
});

// Árbol completo de rutas.
const routeTree = rootRoute.addChildren([
  indexRoute,
  mfaRoute,
  acceptInvitationRoute,
  dashboardRoute,
  usersRoute,
  toolsRoute,
  auditRoute,
  tenantSettingsRoute,
  timeControlRoute,
  erpProjectsRoute,
  erpProjectDetailRoute,
  erpTasksRoute,
  erpExternalCollaborationsRoute,
  erpSimulationsRoute,
  erpTimeControlRoute,
  erpTimeReportRoute,
  timeReportRoute,
  userSettingsRoute,
  supportRoute,
  hrRoute,
]);

// Instancia de router de TanStack.
export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// Re-export para uso en main.tsx.
export { RouterProvider };

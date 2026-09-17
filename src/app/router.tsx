import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { Skeleton } from "../components/ui/skeleton";

function RouteSkeleton() {
  return <div aria-label="Loading page" className="route-skeleton"><Skeleton className="route-skeleton__title" /><div className="route-skeleton__grid"><Skeleton /><Skeleton /><Skeleton /></div><Skeleton className="route-skeleton__wide" /></div>;
}

const ExpensesRoute = lazy(() => import("../features/expenses/ExpenseListPage"));
const DashboardRoute = lazy(() => import("../features/dashboard/DashboardPage"));
const PlantationRoute = lazy(() => import("../features/plantation/PlantationPage"));
const HarvestRoute = lazy(() => import("../features/harvest/HarvestPage"));
const ReportsRoute = lazy(() => import("../features/reports/ReportsPage"));
const DocumentsRoute = lazy(() => import("../features/documents/DocumentsPage"));
const SettingsRoute = lazy(() => import("../features/settings/SettingsPage"));
const SettlementsRoute = lazy(() => import("../features/settlements/SettlementPage"));

function LazyRoute({ children }: { children: ReactNode }) { return <Suspense fallback={<RouteSkeleton />}>{children}</Suspense>; }

export function AppRouter() {
  return <AppShell><Routes><Route index element={<LazyRoute><DashboardRoute /></LazyRoute>} /><Route path="expenses/*" element={<LazyRoute><ExpensesRoute /></LazyRoute>} /><Route path="plantation/*" element={<LazyRoute><PlantationRoute /></LazyRoute>} /><Route path="harvest/*" element={<LazyRoute><HarvestRoute /></LazyRoute>} /><Route path="reports/*" element={<LazyRoute><ReportsRoute /></LazyRoute>} /><Route path="documents/*" element={<LazyRoute><DocumentsRoute /></LazyRoute>} /><Route path="settings/*" element={<LazyRoute><SettingsRoute /></LazyRoute>} /><Route path="settlements/*" element={<LazyRoute><SettlementsRoute /></LazyRoute>} /><Route path="*" element={<Navigate replace to="/" />} /></Routes></AppShell>;
}

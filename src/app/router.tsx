import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { Card, CardContent } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";

function RouteSkeleton() {
  return <div aria-label="Loading page" className="route-skeleton"><Skeleton className="route-skeleton__title" /><div className="route-skeleton__grid"><Skeleton /><Skeleton /><Skeleton /></div><Skeleton className="route-skeleton__wide" /></div>;
}

function placeholderRoute(title: string, description: string) {
  return function PlaceholderRoute() { return <section className="placeholder-route"><div className="page-intro"><span>VKB Farm / {title}</span><h2>{title}</h2><p>{description}</p></div><Card><CardContent><p className="placeholder-route__message">This workspace is ready for the {title.toLowerCase()} tools being added next.</p></CardContent></Card></section>; };
}

const ExpensesRoute = lazy(() => import("../features/expenses/ExpenseListPage"));
const DashboardRoute = lazy(() => import("../features/dashboard/DashboardPage"));
const PlantationRoute = lazy(() => import("../features/plantation/PlantationPage"));
const HarvestRoute = lazy(async () => ({ default: placeholderRoute("Harvest", "Record yield, weights, and crop sale revenue.") }));
const ReportsRoute = lazy(() => import("../features/reports/ReportsPage"));
const DocumentsRoute = lazy(async () => ({ default: placeholderRoute("Documents", "Keep bills and field paperwork together.") }));
const SettingsRoute = lazy(async () => ({ default: placeholderRoute("Settings", "Manage people, categories, and application preferences.") }));
const SettlementsRoute = lazy(() => import("../features/settlements/SettlementPage"));

function LazyRoute({ children }: { children: ReactNode }) { return <Suspense fallback={<RouteSkeleton />}>{children}</Suspense>; }

export function AppRouter() {
  return <AppShell><Routes><Route index element={<LazyRoute><DashboardRoute /></LazyRoute>} /><Route path="expenses/*" element={<LazyRoute><ExpensesRoute /></LazyRoute>} /><Route path="plantation/*" element={<LazyRoute><PlantationRoute /></LazyRoute>} /><Route path="harvest/*" element={<LazyRoute><HarvestRoute /></LazyRoute>} /><Route path="reports/*" element={<LazyRoute><ReportsRoute /></LazyRoute>} /><Route path="documents/*" element={<LazyRoute><DocumentsRoute /></LazyRoute>} /><Route path="settings/*" element={<LazyRoute><SettingsRoute /></LazyRoute>} /><Route path="settlements/*" element={<LazyRoute><SettlementsRoute /></LazyRoute>} /><Route path="*" element={<Navigate replace to="/" />} /></Routes></AppShell>;
}

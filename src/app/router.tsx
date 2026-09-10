import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";

function RouteSkeleton() {
  return <div aria-label="Loading page" className="route-skeleton"><Skeleton className="route-skeleton__title" /><div className="route-skeleton__grid"><Skeleton /><Skeleton /><Skeleton /></div><Skeleton className="route-skeleton__wide" /></div>;
}

function DashboardRoute() {
  return <section className="dashboard-route"><div className="page-intro"><span>Farm position · live ledger</span><h2>Good evening, Satish.</h2><p>See the cash picture and farm activity in one clear view.</p></div><div className="kpi-grid"><Kpi label="Total spend" value="₹29.76L" detail="All-time farm expenditure" /><Kpi label="Your position" value="₹4,918" detail="Receivable from shared costs" emphasis /><Kpi label="Plantation" value="2,740" detail="Trees in inventory" /><Kpi label="Harvest revenue" value="₹10,085" detail="Recorded sale revenue" /></div><Card className="dashboard-note"><CardHeader><span className="dashboard-note__badge">TODAY’S FOCUS</span><CardTitle>Keep your ledger moving</CardTitle></CardHeader><CardContent><p>Capture each bill as it happens. It keeps shared balances and cash flow dependable for everyone.</p></CardContent></Card></section>;
}

function Kpi({ detail, emphasis = false, label, value }: { detail: string; emphasis?: boolean; label: string; value: string }) {
  return <Card className={`kpi-card${emphasis ? " kpi-card--emphasis" : ""}`}><CardContent><p>{label}</p><strong>{value}</strong><span>{detail}</span></CardContent></Card>;
}

function placeholderRoute(title: string, description: string) {
  return function PlaceholderRoute() { return <section className="placeholder-route"><div className="page-intro"><span>VKB Farm / {title}</span><h2>{title}</h2><p>{description}</p></div><Card><CardContent><p className="placeholder-route__message">This workspace is ready for the {title.toLowerCase()} tools being added next.</p></CardContent></Card></section>; };
}

const ExpensesRoute = lazy(async () => ({ default: placeholderRoute("Expenses", "Track every farm purchase, payment, and contribution.") }));
const PlantationRoute = lazy(async () => ({ default: placeholderRoute("Plantation", "Keep crop inventory accurate across the farm.") }));
const HarvestRoute = lazy(async () => ({ default: placeholderRoute("Harvest", "Record yield, weights, and crop sale revenue.") }));
const ReportsRoute = lazy(async () => ({ default: placeholderRoute("Reports", "Turn the ledger into useful financial signals.") }));
const DocumentsRoute = lazy(async () => ({ default: placeholderRoute("Documents", "Keep bills and field paperwork together.") }));
const SettingsRoute = lazy(async () => ({ default: placeholderRoute("Settings", "Manage people, categories, and application preferences.") }));
const SettlementsRoute = lazy(async () => ({ default: placeholderRoute("Settlements", "Review and record member balance transfers.") }));

function LazyRoute({ children }: { children: ReactNode }) { return <Suspense fallback={<RouteSkeleton />}>{children}</Suspense>; }

export function AppRouter() {
  return <AppShell><Routes><Route index element={<DashboardRoute />} /><Route path="expenses/*" element={<LazyRoute><ExpensesRoute /></LazyRoute>} /><Route path="plantation/*" element={<LazyRoute><PlantationRoute /></LazyRoute>} /><Route path="harvest/*" element={<LazyRoute><HarvestRoute /></LazyRoute>} /><Route path="reports/*" element={<LazyRoute><ReportsRoute /></LazyRoute>} /><Route path="documents/*" element={<LazyRoute><DocumentsRoute /></LazyRoute>} /><Route path="settings/*" element={<LazyRoute><SettingsRoute /></LazyRoute>} /><Route path="settlements/*" element={<LazyRoute><SettlementsRoute /></LazyRoute>} /><Route path="*" element={<Navigate replace to="/" />} /></Routes></AppShell>;
}

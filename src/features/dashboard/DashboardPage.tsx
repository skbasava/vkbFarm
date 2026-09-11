import { ErrorState } from "../../components/ui/error-state";
import { Skeleton } from "../../components/ui/skeleton";
import { ExpenseCharts } from "./ExpenseCharts";
import { KpiGrid } from "./KpiGrid";
import { RecentActivity } from "./RecentActivity";
import { useDashboard } from "./api";

export default function DashboardPage() {
  const dashboard = useDashboard();
  if (dashboard.isLoading) return <section aria-label="Loading dashboard" className="dashboard-page dashboard-page--loading"><div className="page-intro"><Skeleton className="dashboard-skeleton-title" /></div><div className="dashboard-kpis">{Array.from({ length: 4 }, (_, index) => <Skeleton data-testid="dashboard-skeleton-card" key={index} />)}</div><Skeleton /><Skeleton /></section>;
  if (dashboard.isError || !dashboard.data) return <section className="dashboard-page"><ErrorState title="We could not load the farm dashboard" /></section>;
  return <section className="dashboard-page"><header className="page-intro"><span>Farm position · live ledger</span><h2>Farm at a glance</h2><p>Cash, costs, partner position, and field activity in one operational view.</p></header><KpiGrid dashboard={dashboard.data} /><ExpenseCharts dashboard={dashboard.data} /><RecentActivity dashboard={dashboard.data} /></section>;
}

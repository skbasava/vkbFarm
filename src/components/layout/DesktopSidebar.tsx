import { BarChart3, FileText, House, Landmark, Leaf, ReceiptText, Settings, Sprout, Wheat } from "lucide-react";
import { NavLink } from "react-router-dom";

const navigation = [
  { to: "/", label: "Dashboard", icon: House, end: true },
  { to: "/expenses", label: "Expenses", icon: ReceiptText },
  { to: "/settlements", label: "Settlements", icon: Landmark },
  { to: "/plantation", label: "Plantation", icon: Sprout },
  { to: "/harvest", label: "Harvest", icon: Wheat },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/documents", label: "Documents", icon: FileText },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function DesktopSidebar() {
  return (
    <aside className="desktop-sidebar">
      <a className="brand" href="/"><span className="brand__mark"><Leaf aria-hidden="true" size={21} /></span><span><strong>VKB</strong><em>FARM</em></span></a>
      <p className="sidebar__label">Operations ledger</p>
      <nav aria-label="Primary navigation" className="desktop-nav">
        {navigation.map(({ end, icon: Icon, label, to }) => <NavLink className={({ isActive }) => `nav-link${isActive ? " is-active" : ""}`} end={end} key={to} to={to}><Icon aria-hidden="true" size={18} /><span>{label}</span></NavLink>)}
      </nav>
      <div className="sidebar__foot"><span className="status-dot" /> All records synced</div>
    </aside>
  );
}

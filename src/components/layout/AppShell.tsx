import type { ReactNode } from "react";
import { CirclePlus, Menu, Sprout } from "lucide-react";
import { useState } from "react";
import { useLocation } from "react-router-dom";
import { Button } from "../ui/button";
import { DesktopSidebar } from "./DesktopSidebar";
import { MobileNavigation } from "./MobileNavigation";
import { QuickActionSheet } from "./QuickActionSheet";

type AppShellProps = { children: ReactNode };

function pageName(pathname: string) {
  if (pathname.startsWith("/expenses")) return "Expenses";
  if (pathname.startsWith("/plantation")) return "Plantation";
  if (pathname.startsWith("/harvest")) return "Harvest";
  if (pathname.startsWith("/reports")) return "Reports";
  if (pathname.startsWith("/documents")) return "Documents";
  if (pathname.startsWith("/settings")) return "Settings";
  if (pathname.startsWith("/settlements")) return "Settlements";
  return "Dashboard";
}

export function AppShell({ children }: AppShellProps) {
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const { pathname } = useLocation();
  const title = pageName(pathname);

  return <div className="app-shell"><DesktopSidebar /><div className="app-shell__body"><header className="topbar"><div className="topbar__title"><Menu aria-hidden="true" className="topbar__menu" size={20} /><div><p>VKB Farm <span>/</span> Operations</p><h1>{title}</h1></div></div><Button className="topbar__quick" onClick={() => setQuickActionsOpen(true)}><CirclePlus aria-hidden="true" size={18} /> Quick add</Button><button aria-label="Open quick actions" className="topbar__compact-add" onClick={() => setQuickActionsOpen(true)}><Sprout aria-hidden="true" size={18} /></button></header><main className="app-shell__content">{children}</main></div><MobileNavigation onQuickAdd={() => setQuickActionsOpen(true)} /><QuickActionSheet onOpenChange={setQuickActionsOpen} open={quickActionsOpen} /></div>;
}

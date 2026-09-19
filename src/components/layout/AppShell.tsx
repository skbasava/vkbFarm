import type { ReactNode } from "react";
import { CirclePlus, Menu, Sprout } from "lucide-react";
import { useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { canManageExpenses, useIdentity } from "../../lib/identity";
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
  const [tabletNavigationOpen, setTabletNavigationOpen] = useState(false);
  const quickActionTrigger = useRef<HTMLElement | null>(null);
  const { pathname } = useLocation();
  const identity = useIdentity();
  const canWrite = canManageExpenses(identity.data);
  const title = pageName(pathname);
  const openQuickActions = (trigger: HTMLElement) => {
    quickActionTrigger.current = trigger;
    setQuickActionsOpen(true);
  };

  return <div className="app-shell" data-sidebar-expanded={tabletNavigationOpen}>
    <a className="skip-link" href="#main-content" onClick={() => document.getElementById("main-content")?.focus()}>Skip to main content</a>
    <DesktopSidebar />
    <div className="app-shell__body"><header className="topbar"><div className="topbar__title"><button aria-expanded={tabletNavigationOpen} aria-label="Toggle navigation" className="topbar__menu-button" onClick={() => setTabletNavigationOpen((open) => !open)} type="button"><Menu aria-hidden="true" size={20} /></button><div><p>VKB Farm <span>/</span> Operations</p><h1>{title}</h1></div></div>{canWrite ? <><Button className="topbar__quick" onClick={(event) => openQuickActions(event.currentTarget)}><CirclePlus aria-hidden="true" size={18} /> Quick add</Button><button aria-label="Open quick actions" className="topbar__compact-add" onClick={(event) => openQuickActions(event.currentTarget)}><Sprout aria-hidden="true" size={18} /></button></> : null}</header><div className="connectivity-status"><span aria-hidden="true" className="status-dot" /> Server-backed records · writes require network</div><main className="app-shell__content" id="main-content" tabIndex={-1}>{children}</main></div>
    <MobileNavigation canQuickAdd={canWrite} onQuickAdd={openQuickActions} />
    <QuickActionSheet canWrite={canWrite} onOpenChange={setQuickActionsOpen} open={quickActionsOpen} returnFocus={() => quickActionTrigger.current?.focus()} />
  </div>;
}

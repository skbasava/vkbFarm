import { Ellipsis, House, ReceiptText, Sprout, Wheat } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";

type MobileNavigationProps = { onQuickAdd: () => void };
type NavigationGroup = "farm" | "more";

export function MobileNavigation({ onQuickAdd }: MobileNavigationProps) {
  const [openGroup, setOpenGroup] = useState<NavigationGroup | null>(null);
  const triggerRefs = useRef<Record<NavigationGroup, HTMLButtonElement | null>>({ farm: null, more: null });
  const closeGroup = useCallback(() => {
    if (openGroup) triggerRefs.current[openGroup]?.focus();
    setOpenGroup(null);
  }, [openGroup]);
  const toggleGroup = (group: NavigationGroup) => setOpenGroup((current) => current === group ? null : group);

  useEffect(() => {
    if (!openGroup) return;
    const dismissWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeGroup();
      }
    };
    document.addEventListener("keydown", dismissWithEscape);
    return () => document.removeEventListener("keydown", dismissWithEscape);
  }, [closeGroup, openGroup]);

  return <nav aria-label="Mobile navigation" className="mobile-nav">
    <NavLink aria-label="Home" end to="/"><House aria-hidden="true" size={19} /><span>Home</span></NavLink>
    <NavLink end to="/expenses"><ReceiptText aria-hidden="true" size={19} /><span>Expenses</span></NavLink>
    <button aria-label="Add record" className="mobile-nav__quick" onClick={onQuickAdd}><span><Sprout aria-hidden="true" size={23} /></span><b>Quick add</b></button>
    <button aria-controls="farm-navigation" aria-expanded={openGroup === "farm"} className={openGroup === "farm" ? "is-active" : undefined} onClick={() => toggleGroup("farm")} ref={(node) => { triggerRefs.current.farm = node; }}><Wheat aria-hidden="true" size={19} /><span>Farm</span></button>
    <button aria-controls="more-navigation" aria-expanded={openGroup === "more"} className={openGroup === "more" ? "is-active" : undefined} onClick={() => toggleGroup("more")} ref={(node) => { triggerRefs.current.more = node; }}><Ellipsis aria-hidden="true" size={22} /><span>More</span></button>
    {openGroup === "farm" ? <div aria-label="Farm navigation" className="mobile-nav__menu" id="farm-navigation" role="region"><ul><li><Link onClick={() => setOpenGroup(null)} to="/plantation">Plantation</Link></li><li><Link onClick={() => setOpenGroup(null)} to="/harvest">Harvest</Link></li></ul></div> : null}
    {openGroup === "more" ? <div aria-label="More navigation" className="mobile-nav__menu" id="more-navigation" role="region"><ul><li><Link onClick={() => setOpenGroup(null)} to="/reports">Reports</Link></li><li><Link onClick={() => setOpenGroup(null)} to="/documents">Documents</Link></li><li><Link onClick={() => setOpenGroup(null)} to="/settings">Settings</Link></li></ul></div> : null}
  </nav>;
}

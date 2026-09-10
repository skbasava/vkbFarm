import { Ellipsis, House, ReceiptText, Sprout, Wheat } from "lucide-react";
import { useState } from "react";
import { Link, NavLink } from "react-router-dom";

type MobileNavigationProps = { onQuickAdd: () => void };

export function MobileNavigation({ onQuickAdd }: MobileNavigationProps) {
  const [openGroup, setOpenGroup] = useState<"farm" | "more" | null>(null);
  const toggleGroup = (group: "farm" | "more") => setOpenGroup((current) => current === group ? null : group);

  return <nav aria-label="Mobile navigation" className="mobile-nav">
    <NavLink aria-label="Home" end to="/"><House aria-hidden="true" size={19} /><span>Home</span></NavLink>
    <NavLink end to="/expenses"><ReceiptText aria-hidden="true" size={19} /><span>Expenses</span></NavLink>
    <button aria-label="Add record" className="mobile-nav__quick" onClick={onQuickAdd}><span><Sprout aria-hidden="true" size={23} /></span><b>Quick add</b></button>
    <button aria-expanded={openGroup === "farm"} aria-haspopup="menu" className={openGroup === "farm" ? "is-active" : undefined} onClick={() => toggleGroup("farm")}><Wheat aria-hidden="true" size={19} /><span>Farm</span></button>
    <button aria-expanded={openGroup === "more"} aria-haspopup="menu" className={openGroup === "more" ? "is-active" : undefined} onClick={() => toggleGroup("more")}><Ellipsis aria-hidden="true" size={22} /><span>More</span></button>
    {openGroup === "farm" ? <div aria-label="Farm navigation" className="mobile-nav__menu" role="menu"><Link onClick={() => setOpenGroup(null)} role="menuitem" to="/plantation">Plantation</Link><Link onClick={() => setOpenGroup(null)} role="menuitem" to="/harvest">Harvest</Link></div> : null}
    {openGroup === "more" ? <div aria-label="More navigation" className="mobile-nav__menu" role="menu"><Link onClick={() => setOpenGroup(null)} role="menuitem" to="/reports">Reports</Link><Link onClick={() => setOpenGroup(null)} role="menuitem" to="/documents">Documents</Link><Link onClick={() => setOpenGroup(null)} role="menuitem" to="/settings">Settings</Link></div> : null}
  </nav>;
}

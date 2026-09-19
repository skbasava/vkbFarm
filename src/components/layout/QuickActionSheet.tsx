import { Calculator, Camera, ChevronRight, CirclePlus, Landmark, Sprout, Wheat } from "lucide-react";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog";

type QuickActionSheetProps = { canWrite: boolean; onOpenChange: (open: boolean) => void; open: boolean; returnFocus?: () => void };

const quickActions = [
  { to: "/expenses/new", label: "Add expense", description: "Log a purchase or payment", icon: CirclePlus },
  { to: "/harvest/new", label: "Record harvest", description: "Capture crop sale details", icon: Wheat },
  { to: "/plantation/new", label: "Add plantation", description: "Update crop inventory", icon: Sprout },
  { to: "/settlements/new", label: "Settle balance", description: "Record a member transfer", icon: Landmark },
  { to: "/documents/new", label: "Upload bill", description: "Attach a receipt or document", icon: Camera },
];

export function QuickActionSheet({ canWrite, onOpenChange, open, returnFocus }: QuickActionSheetProps) {
  return <Dialog onOpenChange={onOpenChange} open={open}><DialogContent aria-describedby="quick-actions-description" aria-label="Quick actions" className="quick-sheet" onCloseAutoFocus={(event) => { if (returnFocus) { event.preventDefault(); returnFocus(); } }}><div className="quick-sheet__heading"><span className="quick-sheet__icon"><Calculator aria-hidden="true" size={19} /></span><div><DialogTitle>Quick actions</DialogTitle><DialogDescription id="quick-actions-description">{canWrite ? "Keep the farm ledger up to date." : "Read-only access: an editor can add farm records."}</DialogDescription></div></div>{canWrite ? <div className="quick-sheet__list">{quickActions.map(({ description, icon: Icon, label, to }) => <Link className="quick-action" key={to} onClick={() => onOpenChange(false)} to={to}><span className="quick-action__icon"><Icon aria-hidden="true" size={18} /></span><span><strong>{label}</strong><small>{description}</small></span><ChevronRight aria-hidden="true" size={18} /></Link>)}</div> : null}</DialogContent></Dialog>;
}

import type { ReactNode } from "react";

type EmptyStateProps = { action?: ReactNode; description: string; title: string };

export function EmptyState({ action, description, title }: EmptyStateProps) {
  return <section className="state state--empty"><p className="state__eyebrow">Nothing here yet</p><h2>{title}</h2><p>{description}</p>{action}</section>;
}

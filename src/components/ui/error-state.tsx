import type { ReactNode } from "react";

type ErrorStateProps = { action?: ReactNode; description?: string; title?: string };

export function ErrorState({ action, description = "Try again in a moment. Your work has not been changed.", title = "We could not load this view" }: ErrorStateProps) {
  return <section className="state state--error" role="alert"><p className="state__eyebrow">Connection issue</p><h2>{title}</h2><p>{description}</p>{action}</section>;
}

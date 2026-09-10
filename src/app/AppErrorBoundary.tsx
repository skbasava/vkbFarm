import type { ReactNode } from "react";
import { Component } from "react";
import { Button } from "../components/ui/button";
import { ErrorState } from "../components/ui/error-state";

type AppErrorBoundaryProps = { children: ReactNode };
type AppErrorBoundaryState = { hasError: boolean };

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  public state: AppErrorBoundaryState = { hasError: false };

  public static getDerivedStateFromError(): AppErrorBoundaryState { return { hasError: true }; }
  public componentDidCatch() { /* boundary intentionally retains the user-safe fallback */ }
  private reset = () => this.setState({ hasError: false });

  public render() {
    if (this.state.hasError) return <main className="app-error"><ErrorState action={<Button onClick={this.reset}>Try again</Button>} /></main>;
    return this.props.children;
  }
}

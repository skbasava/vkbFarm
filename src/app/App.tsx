import { BrowserRouter } from "react-router-dom";
import { AppErrorBoundary } from "./AppErrorBoundary";
import { AppProviders } from "./providers";
import { AppRouter } from "./router";

export default function App() {
  return <AppErrorBoundary><AppProviders><BrowserRouter><AppRouter /></BrowserRouter></AppProviders></AppErrorBoundary>;
}

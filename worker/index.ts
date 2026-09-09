import { Hono } from "hono";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>();

app.get("/api/v1/health", (c) =>
  c.json({ data: { name: "VKB Farm Manager", status: "ok" as const } }),
);

export default app;

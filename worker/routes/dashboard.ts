import { Hono } from "hono";
import { getDashboard } from "../services/report-service";
import type { AppEnv } from "../types";

export const dashboardRoutes = new Hono<AppEnv>();

dashboardRoutes.get("/", async (c) => c.json({ data: await getDashboard(c.env.DB) }));

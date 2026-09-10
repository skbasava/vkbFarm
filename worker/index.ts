import { Hono } from "hono";
import { errorHandler, notFoundHandler } from "./middleware/errors";
import { identityMiddleware } from "./middleware/identity";
import { categoryRoutes } from "./routes/categories";
import { expenseRoutes } from "./routes/expenses";
import { peopleRoutes } from "./routes/people";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>();

app.onError(errorHandler);
app.notFound(notFoundHandler);

// Cloudflare Access must protect every production and preview hostname so this
// header is only accepted after Access has authenticated the request.
app.use("/api/v1/*", async (c, next) => {
  if (c.req.path === "/api/v1/health") {
    await next();
    return;
  }
  await identityMiddleware(c, next);
});

app.get("/api/v1/health", (c) =>
  c.json({ data: { name: "VKB Farm Manager", status: "ok" as const } }),
);

app.route("/api/v1/expenses", expenseRoutes);
app.route("/api/v1/categories", categoryRoutes);
app.route("/api/v1/people", peopleRoutes);

export default app;

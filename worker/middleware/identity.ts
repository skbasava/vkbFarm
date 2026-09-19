import type { Context, MiddlewareHandler } from "hono";
import { ApiHttpError } from "./errors";
import type { AppEnv, Identity } from "../types";

type PersonIdentityRow = {
  email: string;
  app_role: Identity["role"];
};

function isLocalDevelopment(c: Context<AppEnv>): boolean {
  return c.env.ENVIRONMENT === "local" && c.env.DEV_AUTH_ENABLED === "true";
}

async function findAccessIdentity(c: Context<AppEnv>): Promise<Identity | undefined> {
  const email = c.req.header("Cf-Access-Authenticated-User-Email")?.trim().toLowerCase();
  if (!email) return undefined;

  const person = await c.env.DB.prepare(
    "SELECT email, app_role FROM people WHERE email = ? AND active = 1 LIMIT 1",
  )
    .bind(email)
    .first<PersonIdentityRow>();

  if (person) {
    return { email: person.email, role: person.app_role };
  }

  return { email, role: "viewer" };
}

export async function resolveIdentity(c: Context<AppEnv>): Promise<Identity | undefined> {
  if (isLocalDevelopment(c)) {
    return { email: "dev@vkb.local", role: "admin" };
  }
  return findAccessIdentity(c);
}

export const identityMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const identity = await resolveIdentity(c);
  if (!identity) {
    throw new ApiHttpError(401, "UNAUTHORIZED", "Authentication is required");
  }
  c.set("identity", identity);
  await next();
};

export function getIdentity(c: Context<AppEnv>): Identity {
  return c.get("identity");
}

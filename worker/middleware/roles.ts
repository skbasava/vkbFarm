import type { MiddlewareHandler } from "hono";
import { ApiHttpError } from "./errors";
import { getIdentity } from "./identity";
import type { AppEnv, Identity } from "../types";

const roleRank: Record<Identity["role"], number> = {
  viewer: 0,
  editor: 1,
  admin: 2,
};

/** Requires the given role or a more privileged application role. */
export function requireRole(role: Identity["role"]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (roleRank[getIdentity(c).role] < roleRank[role]) {
      throw new ApiHttpError(
        403,
        "FORBIDDEN",
        "You do not have permission to perform this action",
      );
    }
    await next();
  };
}

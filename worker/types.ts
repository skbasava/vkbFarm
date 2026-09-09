export type Bindings = {
  DB: D1Database;
  RECEIPTS: R2Bucket;
  ENVIRONMENT: "local" | "production";
  DEV_AUTH_ENABLED?: string;
};

export type Identity = {
  email: string;
  role: "admin" | "editor" | "viewer";
};

export type AppVariables = { identity: Identity };
export type AppEnv = { Bindings: Bindings; Variables: AppVariables };

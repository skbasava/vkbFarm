export type Bindings = {
  DB: D1Database;
  RECEIPTS: R2Bucket;
  ENVIRONMENT: "local" | "production";
  DEV_AUTH_ENABLED?: string;
  DOCUMENT_MAX_BYTES: string;
};

export type TestBindings = Bindings & {
  TEST_MIGRATIONS: import("@cloudflare/vitest-plugin").D1Migration[];
};

export type Identity = {
  email: string;
  role: "admin" | "editor" | "viewer";
};

export type AppVariables = { identity: Identity };
export type AppEnv = { Bindings: Bindings; Variables: AppVariables };

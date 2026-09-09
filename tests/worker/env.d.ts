import type { TestBindings } from "../../worker/types";

declare namespace Cloudflare {
  interface Env extends TestBindings {
    TEST_MIGRATIONS: TestBindings["TEST_MIGRATIONS"];
  }
}

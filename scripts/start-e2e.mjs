import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";

const root = process.cwd();
const suppliedTemporaryRoot = process.env.VKB_E2E_TEMP_ROOT;
const temporaryRoot = suppliedTemporaryRoot ?? (await mkdtemp(join(tmpdir(), "vkb-farm-e2e-")));
const ownsTemporaryRoot = suppliedTemporaryRoot === undefined;
const persistencePath = join(temporaryRoot, "state");
const wrangler = join(root, "node_modules", ".bin", "wrangler");
const vite = join(root, "node_modules", ".bin", "vite");
const environment = {
  ...process.env,
  CLOUDFLARE_ENV: "production",
  VKB_E2E_PERSIST_TO: persistencePath,
  WRANGLER_LOG_PATH: join(temporaryRoot, "wrangler.log"),
};

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, env: environment, stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`${command} failed with status ${String(result.status)}`);
  }
}

async function cleanup() {
  if (ownsTemporaryRoot) {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
}

try {
  run(wrangler, [
    "d1",
    "migrations",
    "apply",
    "vkb-farm-db",
    "--env",
    "production",
    "--local",
    "--persist-to",
    persistencePath,
  ]);
  run(wrangler, [
    "d1",
    "execute",
    "vkb-farm-db",
    "--env",
    "production",
    "--local",
    "--persist-to",
    persistencePath,
    "--file",
    join(root, "tests/e2e/fixtures/seed.sql"),
  ]);
  run(join(root, "node_modules", ".bin", "vite"), ["build"]);

  const previewEnvironment = { ...environment };
  delete previewEnvironment.CLOUDFLARE_ENV;
  const server = spawn(vite, ["preview", "--host", "127.0.0.1", "--port", "4173", "--strictPort"], {
    cwd: root,
    env: previewEnvironment,
    stdio: "inherit",
  });

  const stop = (signal) => {
    if (!server.killed) server.kill(signal);
  };
  process.once("SIGINT", () => stop("SIGINT"));
  process.once("SIGTERM", () => stop("SIGTERM"));

  const exitCode = await new Promise((resolve) => {
    server.once("exit", (code) => resolve(code ?? 0));
    server.once("error", () => resolve(1));
  });
  await cleanup();
  process.exitCode = exitCode;
} catch (error) {
  await cleanup();
  throw error;
}

import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const temporaryRoot = await mkdtemp(join(tmpdir(), "vkb-farm-e2e-"));
const playwright = join(root, "node_modules", ".bin", "playwright");
const environment = {
  ...process.env,
  VKB_E2E_TEMP_ROOT: temporaryRoot,
};
delete environment.NO_COLOR;

async function runPlaywright() {
  const child = spawn(playwright, ["test", ...process.argv.slice(2)], {
    cwd: root,
    env: environment,
    stdio: "inherit",
  });
  const stop = (signal) => {
    if (!child.killed) child.kill(signal);
  };
  const interrupt = () => stop("SIGINT");
  const terminate = () => stop("SIGTERM");
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", terminate);

  try {
    return await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        resolve(code ?? (signal === "SIGINT" ? 130 : signal === "SIGTERM" ? 143 : 1));
      });
    });
  } finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", terminate);
  }
}

let exitCode;
try {
  exitCode = await runPlaywright();
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}

process.exitCode = exitCode;

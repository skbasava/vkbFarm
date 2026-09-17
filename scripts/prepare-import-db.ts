import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareLocalPersistenceDirectory } from "./import-excel";

async function main(args: string[]): Promise<number> {
  try {
    if (args.length !== 2 || args[0] !== "--local-db") throw new Error("Usage: npm run import:prepare -- --local-db <new-or-owned-directory>");
    const prepared = await prepareLocalPersistenceDirectory(args[1]);
    console.log(JSON.stringify({ localDb: prepared, importerOwned: true }, null, 2));
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Import persistence preparation failed");
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) process.exitCode = await main(process.argv.slice(2));

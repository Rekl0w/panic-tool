import { rmSync } from "node:fs";
import { $ } from "bun";

rmSync("dist", { recursive: true, force: true });

await $`bun build ./src/cli.ts ./src/server.ts ./src/index.ts --outdir ./dist --target bun`;
await $`tsc --emitDeclarationOnly`;

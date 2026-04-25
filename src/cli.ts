#!/usr/bin/env bun
import { copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config";
import { runHealthChecks } from "./checkers";
import { generateIncidentSummary } from "./incident";
import { formatHealthReport, formatIncident, formatStatus } from "./format";

const VALID_COMMANDS = new Set(["check", "status", "incident", "init", "help"]);

type Command = "check" | "status" | "incident" | "init" | "help";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = (args[0] ?? "help") as Command;
  const configPath = readFlag(args, "--config") ?? readFlag(args, "-c");

  if (!VALID_COMMANDS.has(command)) {
    printHelp();
    process.exitCode = 1;
    return;
  }

  if (command === "help") {
    printHelp();
    return;
  }

  if (command === "init") {
    await initConfig();
    return;
  }

  const config = await loadConfig(configPath);
  const results = await runHealthChecks(config);

  if (command === "check") {
    console.log(formatHealthReport(results));
    setExitCode(results);
    return;
  }

  if (command === "status") {
    console.log(formatStatus(results));
    setExitCode(results);
    return;
  }

  const summary = generateIncidentSummary(results);
  console.log(formatIncident(summary));
  setExitCode(results);
}

function readFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

function setExitCode(
  results: Awaited<ReturnType<typeof runHealthChecks>>,
): void {
  process.exitCode = results.some(
    (result) => result.status === "down" && result.critical,
  )
    ? 2
    : 0;
}

async function initConfig(): Promise<void> {
  const target = resolve(process.cwd(), "panic.config.json");

  if (existsSync(target)) {
    console.log("panic.config.json already exists. Nothing changed.");
    return;
  }

  const currentDir = dirname(fileURLToPath(import.meta.url));
  await copyFile(
    resolve(currentDir, "..", "panic.config.example.json"),
    target,
  );
  console.log(
    "Created panic.config.json from the example config. Edit it with your real services.",
  );
}

function printHelp(): void {
  console.log(
    `Panic Tool — production incident triage\n\nUsage:\n  panic check              Run all configured health checks\n  panic status             Show a compact status summary\n  panic incident           Generate triage summary + root-cause hints\n  panic init               Create panic.config.json from example\n\nOptions:\n  -c, --config <path>      Use a custom config file\n\nExamples:\n  panic check\n  panic status --config ./prod.panic.json\n  panic incident`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`panic: ${message}`);
  process.exitCode = 1;
});

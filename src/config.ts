import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { PanicConfig, ServiceConfig } from "./types";

const DEFAULT_CONFIG_PATH = "panic.config.json";

export async function loadConfig(
  configPath = process.env.PANIC_CONFIG ?? DEFAULT_CONFIG_PATH,
): Promise<PanicConfig> {
  const absolutePath = resolve(process.cwd(), configPath);

  if (!existsSync(absolutePath)) {
    throw new Error(
      `Config file not found: ${absolutePath}\nCreate one from panic.config.example.json or pass --config <path>.`,
    );
  }

  const raw = await readFile(absolutePath, "utf8");
  const parsed = JSON.parse(raw) as PanicConfig;
  validateConfig(parsed);

  return {
    timeoutMs: parsed.timeoutMs ?? 2000,
    latencyWarningMs: parsed.latencyWarningMs ?? 750,
    services: parsed.services.map((service) => ({
      ...service,
      critical: service.critical ?? false,
      dependsOn: service.dependsOn ?? [],
    })),
  };
}

function validateConfig(config: PanicConfig): void {
  if (!Array.isArray(config.services) || config.services.length === 0) {
    throw new Error("Config must include at least one service.");
  }

  const names = new Set<string>();

  for (const service of config.services) {
    validateService(service);

    if (names.has(service.name)) {
      throw new Error(`Duplicate service name: ${service.name}`);
    }

    names.add(service.name);
  }

  for (const service of config.services) {
    for (const dependency of service.dependsOn ?? []) {
      if (!names.has(dependency)) {
        throw new Error(
          `Service '${service.name}' depends on unknown service '${dependency}'.`,
        );
      }
    }
  }
}

function validateService(service: ServiceConfig): void {
  if (!service.name?.trim()) {
    throw new Error("Every service needs a non-empty name.");
  }

  if (service.type === "http" && !service.url) {
    throw new Error(`HTTP service '${service.name}' requires a url.`);
  }

  if (service.type === "tcp" && (!service.host || !service.port)) {
    throw new Error(`TCP service '${service.name}' requires host and port.`);
  }

  if (service.type !== "http" && service.type !== "tcp") {
    throw new Error(
      `Unsupported service type for '${service.name}': ${service.type}`,
    );
  }
}

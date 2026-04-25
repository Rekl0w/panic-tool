import { connect } from "node:net";
import type { HealthCheckResult, PanicConfig, ServiceConfig } from "./types";

export async function runHealthChecks(
  config: PanicConfig,
): Promise<HealthCheckResult[]> {
  const checks = config.services.map((service) =>
    checkService(service, config),
  );
  return Promise.all(checks);
}

async function checkService(
  service: ServiceConfig,
  config: PanicConfig,
): Promise<HealthCheckResult> {
  const timeoutMs = service.timeoutMs ?? config.timeoutMs ?? 2000;
  const latencyWarningMs = config.latencyWarningMs ?? 750;

  if (service.type === "http") {
    return checkHttp(service, timeoutMs, latencyWarningMs);
  }

  return checkTcp(service, timeoutMs, latencyWarningMs);
}

async function checkHttp(
  service: ServiceConfig,
  timeoutMs: number,
  latencyWarningMs: number,
): Promise<HealthCheckResult> {
  const startedAt = performance.now();
  const checkedAt = new Date().toISOString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(service.url!, {
      method: "GET",
      signal: controller.signal,
      headers: { "user-agent": "panic-tool/0.1" },
    });
    const latencyMs = Math.round(performance.now() - startedAt);
    const expected = service.expectedStatus ?? [200, 204];

    if (!expected.includes(response.status)) {
      return result(
        service,
        "down",
        latencyMs,
        checkedAt,
        service.url!,
        `HTTP ${response.status}`,
      );
    }

    if (latencyMs >= latencyWarningMs) {
      return result(
        service,
        "degraded",
        latencyMs,
        checkedAt,
        service.url!,
        `Slow response (${latencyMs}ms)`,
      );
    }

    return result(
      service,
      "healthy",
      latencyMs,
      checkedAt,
      service.url!,
      "HTTP health check passed",
    );
  } catch (error) {
    const latencyMs = Math.round(performance.now() - startedAt);
    const message =
      error instanceof Error ? error.message : "Unknown HTTP error";
    return result(service, "down", latencyMs, checkedAt, service.url!, message);
  } finally {
    clearTimeout(timeout);
  }
}

async function checkTcp(
  service: ServiceConfig,
  timeoutMs: number,
  latencyWarningMs: number,
): Promise<HealthCheckResult> {
  const startedAt = performance.now();
  const checkedAt = new Date().toISOString();
  const host = service.host;
  const port = service.port;

  if (!host || !port) {
    return result(
      service,
      "down",
      0,
      checkedAt,
      "missing TCP target",
      "TCP service requires host and port",
    );
  }

  const target = `${service.host}:${service.port}`;

  return new Promise((resolve) => {
    const socket = connect({ host, port });
    socket.setTimeout(timeoutMs);

    socket.once("connect", () => {
      const latencyMs = Math.round(performance.now() - startedAt);
      socket.destroy();

      if (latencyMs >= latencyWarningMs) {
        resolve(
          result(
            service,
            "degraded",
            latencyMs,
            checkedAt,
            target,
            `Slow TCP connection (${latencyMs}ms)`,
          ),
        );
        return;
      }

      resolve(
        result(
          service,
          "healthy",
          latencyMs,
          checkedAt,
          target,
          "TCP connection established",
        ),
      );
    });

    socket.once("timeout", () => {
      const latencyMs = Math.round(performance.now() - startedAt);
      socket.destroy();
      resolve(
        result(
          service,
          "down",
          latencyMs,
          checkedAt,
          target,
          `TCP timeout after ${timeoutMs}ms`,
        ),
      );
    });

    socket.once("error", (error) => {
      const latencyMs = Math.round(performance.now() - startedAt);
      socket.destroy();
      resolve(
        result(service, "down", latencyMs, checkedAt, target, error.message),
      );
    });
  });
}

function result(
  service: ServiceConfig,
  status: HealthCheckResult["status"],
  latencyMs: number,
  checkedAt: string,
  target: string,
  message: string,
): HealthCheckResult {
  const checkResult: HealthCheckResult = {
    service: service.name,
    type: service.type,
    status,
    latencyMs,
    critical: service.critical ?? false,
    checkedAt,
    target,
    message,
    dependsOn: service.dependsOn ?? [],
  };

  if (service.logSummary) {
    checkResult.logSummary = service.logSummary;
  }

  return checkResult;
}

import type { HealthCheckResult, HealthStatus, IncidentSummary } from "./types";

export function generateIncidentSummary(
  results: HealthCheckResult[],
): IncidentSummary {
  const failing = results.filter((result) => result.status === "down");
  const degraded = results.filter((result) => result.status === "degraded");
  const healthy = results.filter((result) => result.status === "healthy");
  const rootCauses = inferRootCauses(results);
  const suggestions = generateSuggestions(results, rootCauses);
  const overallStatus = determineOverallStatus(results);

  return {
    overallStatus,
    failing,
    degraded,
    healthy,
    rootCauses,
    suggestions,
    narrative: buildNarrative(
      overallStatus,
      failing,
      degraded,
      healthy,
      rootCauses,
    ),
    checkedAt: new Date().toISOString(),
  };
}

function determineOverallStatus(results: HealthCheckResult[]): HealthStatus {
  if (results.some((result) => result.status === "down" && result.critical)) {
    return "down";
  }

  if (
    results.some(
      (result) => result.status === "down" || result.status === "degraded",
    )
  ) {
    return "degraded";
  }

  return "healthy";
}

function inferRootCauses(results: HealthCheckResult[]): string[] {
  const byName = new Map(
    results.map((result) => [result.service.toLowerCase(), result]),
  );
  const rootCauses = new Set<string>();

  for (const result of results) {
    if (result.status === "healthy") {
      continue;
    }

    for (const dependencyName of result.dependsOn) {
      const dependency = byName.get(dependencyName.toLowerCase());

      if (dependency?.status === "down") {
        rootCauses.add(
          `${result.service} is likely failing because dependency '${dependency.service}' is down.`,
        );
      }

      if (dependency?.status === "degraded") {
        rootCauses.add(
          `${result.service} degradation may be caused by slow dependency '${dependency.service}'.`,
        );
      }
    }
  }

  const db = findByKeyword(results, [
    "db",
    "database",
    "postgres",
    "mysql",
    "mongo",
  ]);
  const api = findByKeyword(results, ["api", "backend", "gateway"]);
  const redis = findByKeyword(results, ["redis", "cache"]);
  const queue = findByKeyword(results, ["queue", "worker", "jobs"]);

  if (db?.status === "down" && api && api.status !== "healthy") {
    rootCauses.add(
      "Database is down, so API failures are likely caused by unavailable DB connections.",
    );
  }

  if (
    redis &&
    redis.status !== "healthy" &&
    queue &&
    queue.status !== "healthy"
  ) {
    rootCauses.add(
      "Redis/cache is unhealthy, so queue or worker backlog is likely related.",
    );
  }

  const slowServices = results.filter(
    (result) => result.status === "degraded" && result.latencyMs >= 500,
  );
  if (slowServices.length > 0) {
    rootCauses.add(
      `High latency detected in ${slowServices.map((result) => result.service).join(", ")}; check downstream dependencies and saturation.`,
    );
  }

  if (
    rootCauses.size === 0 &&
    results.some((result) => result.status !== "healthy")
  ) {
    rootCauses.add(
      "No single root cause is obvious. Start with critical failing services and their dependencies.",
    );
  }

  if (rootCauses.size === 0) {
    rootCauses.add("No active incident detected by configured checks.");
  }

  return [...rootCauses];
}

function generateSuggestions(
  results: HealthCheckResult[],
  rootCauses: string[],
): string[] {
  const suggestions = new Set<string>();
  const failing = results.filter((result) => result.status === "down");
  const degraded = results.filter((result) => result.status === "degraded");

  for (const result of failing) {
    suggestions.add(
      `Check ${result.service} logs and restart the service if it is safe.`,
    );

    if (result.type === "tcp") {
      suggestions.add(
        `Verify network access, port, credentials, and connection pool limits for ${result.service}.`,
      );
    }

    if (result.critical) {
      suggestions.add(`Prioritize ${result.service}; it is marked critical.`);
    }
  }

  for (const result of degraded) {
    suggestions.add(
      `Inspect latency, CPU, memory, and downstream calls for ${result.service}.`,
    );
  }

  if (rootCauses.some((cause) => /database|db/i.test(cause))) {
    suggestions.add(
      "Check DB availability, max connections, slow queries, replication lag, and recent migrations.",
    );
  }

  if (
    rootCauses.some((cause) => /redis|cache|queue|worker|backlog/i.test(cause))
  ) {
    suggestions.add(
      "Check Redis memory/evictions and queue backlog; scale workers or pause noisy producers if needed.",
    );
  }

  if (rootCauses.some((cause) => /latency|slow|downstream/i.test(cause))) {
    suggestions.add(
      "Compare dependency latency, recent deploys, and autoscaling capacity before restarting everything.",
    );
  }

  if (suggestions.size === 0) {
    suggestions.add(
      "No immediate action required. Keep monitoring and re-run panic check if symptoms appear.",
    );
  }

  return [...suggestions];
}

function buildNarrative(
  overallStatus: HealthStatus,
  failing: HealthCheckResult[],
  degraded: HealthCheckResult[],
  healthy: HealthCheckResult[],
  rootCauses: string[],
): string {
  return [
    `Overall status is ${overallStatus.toUpperCase()}.`,
    `${failing.length} failing, ${degraded.length} degraded, ${healthy.length} healthy.`,
    `Most likely: ${rootCauses[0] ?? "No root cause detected."}`,
  ].join(" ");
}

function findByKeyword(
  results: HealthCheckResult[],
  keywords: string[],
): HealthCheckResult | undefined {
  return results.find((result) =>
    keywords.some((keyword) => result.service.toLowerCase().includes(keyword)),
  );
}

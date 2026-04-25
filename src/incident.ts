import type {
  EmergencyDecision,
  HealthCheckResult,
  HealthStatus,
  IncidentSummary,
  RootCauseDecision,
} from "./types";

export function generateIncidentSummary(
  results: HealthCheckResult[],
): IncidentSummary {
  const failing = results.filter((result) => result.status === "down");
  const degraded = results.filter((result) => result.status === "degraded");
  const healthy = results.filter((result) => result.status === "healthy");
  const rootCauses = inferRootCauses(results);
  const mostLikelyRootCause = decideRootCause(results);
  const nextAction = decideNextAction(results, mostLikelyRootCause);
  const impact = decideImpact(results);
  const suggestions = generateSuggestions(results, rootCauses, nextAction);
  const overallStatus = determineOverallStatus(results);

  return {
    overallStatus,
    failing,
    degraded,
    healthy,
    rootCauses,
    suggestions,
    mostLikelyRootCause,
    nextAction,
    impact,
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

export function generateEmergencyDecision(
  results: HealthCheckResult[],
): EmergencyDecision {
  const summary = generateIncidentSummary(results);
  const broken = decideBrokenLine(summary.failing, summary.degraded);

  return {
    what: broken,
    rootCause: summary.mostLikelyRootCause,
    impact: summary.impact,
    nextAction: summary.nextAction,
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

function decideRootCause(results: HealthCheckResult[]): RootCauseDecision {
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

  if (db?.status === "down" && api?.status === "down") {
    return {
      cause: "Database failure is causing API failure.",
      explanation:
        "Rule DB_DOWN_API_DOWN matched: database is DOWN while API is DOWN.",
      rule: "DB_DOWN_API_DOWN",
    };
  }

  if (db?.status === "degraded" && api && api.status !== "healthy") {
    return {
      cause: "Database slowness is causing API latency or instability.",
      explanation:
        "Rule DB_SLOW_API_IMPACT matched: database is DEGRADED while API is unhealthy.",
      rule: "DB_SLOW_API_IMPACT",
    };
  }

  if (queue?.status === "down") {
    return {
      cause: "Queue workers are unavailable or stuck.",
      explanation: "Rule QUEUE_DOWN matched: queue/worker service is DOWN.",
      rule: "QUEUE_DOWN",
    };
  }

  if (queue?.status === "degraded" && db && db.status !== "healthy") {
    return {
      cause: "Queue backlog is likely caused by database bottleneck.",
      explanation:
        "Rule QUEUE_BACKLOG_DB_BOTTLENECK matched: queue is DEGRADED and database is unhealthy.",
      rule: "QUEUE_BACKLOG_DB_BOTTLENECK",
    };
  }

  if (
    redis &&
    redis.status !== "healthy" &&
    queue &&
    queue.status !== "healthy"
  ) {
    return {
      cause: "Redis/cache failure is impacting queue processing.",
      explanation:
        "Rule REDIS_QUEUE_IMPACT matched: Redis and queue are both unhealthy.",
      rule: "REDIS_QUEUE_IMPACT",
    };
  }

  const criticalDown = results.find(
    (result) => result.critical && result.status === "down",
  );
  if (criticalDown) {
    return {
      cause: `${criticalDown.service} is down and marked critical.`,
      explanation:
        "Rule CRITICAL_SERVICE_DOWN matched: a critical service is DOWN.",
      rule: "CRITICAL_SERVICE_DOWN",
    };
  }

  const slowService = results.find((result) => result.status === "degraded");
  if (slowService) {
    return {
      cause: `${slowService.service} is degraded and likely slowing dependent requests.`,
      explanation:
        "Rule SERVICE_DEGRADED matched: at least one service is DEGRADED.",
      rule: "SERVICE_DEGRADED",
    };
  }

  const downService = results.find((result) => result.status === "down");
  if (downService) {
    return {
      cause: `${downService.service} is down.`,
      explanation: "Rule SERVICE_DOWN matched: at least one service is DOWN.",
      rule: "SERVICE_DOWN",
    };
  }

  return {
    cause: "No active incident detected.",
    explanation:
      "Rule ALL_SERVICES_OK matched: all configured checks are healthy.",
    rule: "ALL_SERVICES_OK",
  };
}

function decideNextAction(
  results: HealthCheckResult[],
  rootCause: RootCauseDecision,
): string {
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

  switch (rootCause.rule) {
    case "DB_DOWN_API_DOWN":
      return "Check database availability and connection pool before restarting the API.";
    case "DB_SLOW_API_IMPACT":
      return "Inspect slow queries and scale or fail over the database if saturation is confirmed.";
    case "QUEUE_DOWN":
      return "Restart queue workers and verify they can connect to the broker.";
    case "QUEUE_BACKLOG_DB_BOTTLENECK":
      return "Reduce queue producers and fix the database bottleneck before scaling workers.";
    case "REDIS_QUEUE_IMPACT":
      return "Check Redis memory and connectivity, then restart impacted workers.";
    case "CRITICAL_SERVICE_DOWN": {
      const service = results.find(
        (result) => result.critical && result.status === "down",
      );
      return `Restart or fail over ${service?.service ?? "the critical service"} now.`;
    }
    case "SERVICE_DEGRADED": {
      const service = results.find((result) => result.status === "degraded");
      return `Inspect ${service?.service ?? "the degraded service"} latency, saturation, and downstream dependencies.`;
    }
    case "SERVICE_DOWN": {
      const service = results.find((result) => result.status === "down");
      return `Restart ${service?.service ?? "the down service"} and verify its dependency connections.`;
    }
    default:
      if (api?.status !== "healthy") {
        return "Check API logs and dependency connectivity.";
      }
      if (db?.status !== "healthy") {
        return "Check database connectivity and connection pool health.";
      }
      if (redis?.status !== "healthy") {
        return "Check Redis connectivity and memory pressure.";
      }
      if (queue?.status !== "healthy") {
        return "Check worker process health and queue backlog.";
      }
      return "No immediate action required; keep monitoring.";
  }
}

function decideImpact(results: HealthCheckResult[]): string {
  const criticalDown = results.filter(
    (result) => result.critical && result.status === "down",
  );
  const criticalDegraded = results.filter(
    (result) => result.critical && result.status === "degraded",
  );
  const nonHealthy = results.filter((result) => result.status !== "healthy");

  if (criticalDown.length > 0) {
    return `Critical outage affecting ${criticalDown.map((result) => result.service).join(", ")}.`;
  }

  if (criticalDegraded.length > 0) {
    return `Critical path degraded for ${criticalDegraded.map((result) => result.service).join(", ")}.`;
  }

  if (nonHealthy.length > 0) {
    return `Partial degradation affecting ${nonHealthy.map((result) => result.service).join(", ")}.`;
  }

  return "No customer-impacting issue detected by configured checks.";
}

function decideBrokenLine(
  failing: HealthCheckResult[],
  degraded: HealthCheckResult[],
): string {
  if (failing.length > 0) {
    return `${failing.map((result) => result.service).join(", ")} is DOWN.`;
  }

  if (degraded.length > 0) {
    return `${degraded.map((result) => result.service).join(", ")} is DEGRADED.`;
  }

  return "Nothing is broken.";
}

function generateSuggestions(
  results: HealthCheckResult[],
  rootCauses: string[],
  nextAction: string,
): string[] {
  const suggestions = new Set<string>([nextAction]);
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

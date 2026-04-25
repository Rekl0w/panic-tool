import type {
  EmergencyDecision,
  HealthCheckResult,
  IncidentSummary,
} from "./types";

const STATUS_ICON = {
  healthy: "✅",
  degraded: "⚠️ ",
  down: "❌",
  unknown: "❔",
} as const;

export function formatHealthReport(results: HealthCheckResult[]): string {
  const lines = [
    "Panic Tool — Health Check",
    "=========================",
    "",
    ...results.map(formatResultLine),
  ];

  return lines.join("\n");
}

export function formatFullHealthReport(
  results: HealthCheckResult[],
  summary: IncidentSummary,
): string {
  return [
    "Panic Tool — Full System Check",
    "==============================",
    "",
    `Overall: ${normalizeStatus(summary.overallStatus)}`,
    `Checked: ${summary.checkedAt}`,
    "",
    "Services:",
    ...results.map(formatFullResultLine),
    "",
    "Dependencies:",
    ...formatDependencyLines(results),
    "",
    "Log summaries:",
    ...formatLogSummaries(results),
    "",
    "Rule engine:",
    `  Rule       : ${summary.mostLikelyRootCause.rule}`,
    `  Cause      : ${summary.mostLikelyRootCause.cause}`,
    `  Explanation: ${summary.mostLikelyRootCause.explanation}`,
    "",
    "Suggested next action:",
    `  ${summary.nextAction}`,
  ].join("\n");
}

export function formatStatus(results: HealthCheckResult[]): string {
  const failing = results.filter((result) => result.status === "down");
  const degraded = results.filter((result) => result.status === "degraded");
  const healthy = results.filter((result) => result.status === "healthy");

  return [
    "Panic Tool — Status",
    "===================",
    "",
    `Failing : ${failing.length}`,
    `Degraded: ${degraded.length}`,
    `Healthy : ${healthy.length}`,
    "",
    "Critical failures:",
    ...formatGroup(failing.filter((result) => result.critical)),
  ].join("\n");
}

export function formatIncident(summary: IncidentSummary): string {
  return [
    "Panic Tool — Incident Triage",
    "============================",
    "",
    `${STATUS_ICON[summary.overallStatus]} Overall: ${summary.overallStatus.toUpperCase()}`,
    `Checked: ${summary.checkedAt}`,
    "",
    "Summary:",
    `  ${summary.narrative}`,
    "",
    "Failing:",
    ...formatGroup(summary.failing),
    "",
    "Degraded:",
    ...formatGroup(summary.degraded),
    "",
    "Healthy:",
    ...formatGroup(summary.healthy),
    "",
    "Probable root cause:",
    ...summary.rootCauses.map((cause) => `  - ${cause}`),
    "",
    "What to do now:",
    ...summary.suggestions.map(
      (suggestion, index) => `  ${index + 1}. ${suggestion}`,
    ),
  ].join("\n");
}

export function formatEmergency(decision: EmergencyDecision): string {
  return [
    `WHAT: ${decision.what}`,
    `ROOT CAUSE: ${decision.rootCause.cause} ${decision.rootCause.explanation}`,
    `IMPACT: ${decision.impact}`,
    `NEXT ACTION: ${decision.nextAction}`,
  ].join("\n");
}

function formatResultLine(result: HealthCheckResult): string {
  const critical = result.critical ? " critical" : "";
  return `${STATUS_ICON[result.status]} ${result.service.padEnd(12)} ${result.status.padEnd(8)} ${String(result.latencyMs).padStart(5)}ms ${result.target}${critical} — ${result.message}`;
}

function formatFullResultLine(result: HealthCheckResult): string {
  const critical = result.critical ? "yes" : "no";
  return `  - ${result.service}\n    status     : ${normalizeStatus(result.status)}\n    type       : ${result.type}\n    target     : ${result.target}\n    latency    : ${result.latencyMs}ms\n    critical   : ${critical}\n    message    : ${result.message}`;
}

function formatDependencyLines(results: HealthCheckResult[]): string[] {
  const byName = new Map(
    results.map((result) => [result.service.toLowerCase(), result]),
  );

  const lines = results.flatMap((result) => {
    if (result.dependsOn.length === 0) {
      return [`  - ${result.service}: none`];
    }

    const dependencies = result.dependsOn.map((dependencyName) => {
      const dependency = byName.get(dependencyName.toLowerCase());
      return dependency
        ? `${dependency.service}=${normalizeStatus(dependency.status)}`
        : `${dependencyName}=UNKNOWN`;
    });

    return [`  - ${result.service}: ${dependencies.join(", ")}`];
  });

  return lines.length > 0 ? lines : ["  - none"];
}

function formatLogSummaries(results: HealthCheckResult[]): string[] {
  const summaries = results.filter((result) => result.logSummary);

  if (summaries.length === 0) {
    return ["  - none configured"];
  }

  return summaries.map(
    (result) => `  - ${result.service}: ${result.logSummary ?? "none"}`,
  );
}

function normalizeStatus(status: HealthCheckResult["status"]): string {
  if (status === "healthy") {
    return "OK";
  }

  return status.toUpperCase();
}

function formatGroup(results: HealthCheckResult[]): string[] {
  if (results.length === 0) {
    return ["  - none"];
  }

  return results.map(
    (result) =>
      `  - ${result.service}: ${result.message} (${result.latencyMs}ms)`,
  );
}

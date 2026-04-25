import type { HealthCheckResult, IncidentSummary } from "./types";

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

function formatResultLine(result: HealthCheckResult): string {
  const critical = result.critical ? " critical" : "";
  return `${STATUS_ICON[result.status]} ${result.service.padEnd(12)} ${result.status.padEnd(8)} ${String(result.latencyMs).padStart(5)}ms ${result.target}${critical} — ${result.message}`;
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

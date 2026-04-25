import { Hono } from "hono";
import { loadConfig } from "./config";
import { runHealthChecks } from "./checkers";
import { generateIncidentSummary } from "./incident";

const app = new Hono();

app.get("/", (context) => {
  return context.json({
    name: "Panic Tool",
    purpose: "Minimal production incident triage backend",
    endpoints: ["GET /health", "GET /status", "GET /incident"],
  });
});

app.get("/health", async (context) => {
  const config = await loadConfig();
  const results = await runHealthChecks(config);
  return context.json({ checks: results });
});

app.get("/status", async (context) => {
  const config = await loadConfig();
  const results = await runHealthChecks(config);
  const summary = generateIncidentSummary(results);

  return context.json({
    overallStatus: summary.overallStatus,
    failing: summary.failing.length,
    degraded: summary.degraded.length,
    healthy: summary.healthy.length,
    checkedAt: summary.checkedAt,
  });
});

app.get("/incident", async (context) => {
  const config = await loadConfig();
  const results = await runHealthChecks(config);
  return context.json(generateIncidentSummary(results));
});

const port = Number(process.env.PORT ?? 3030);

Bun.serve({
  fetch: app.fetch,
  port,
});

console.log(`Panic Tool backend listening on http://localhost:${port}`);

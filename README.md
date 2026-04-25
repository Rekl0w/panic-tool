# Panic Tool

**Panic Tool** is a tiny dual-mode production incident response CLI for developers and on-call engineers.

It is **not** a dashboard, observability platform, log collector, alerting system, or Sentry clone. It is intentionally focused on one operational question:

> What is broken, what is probably causing it, and what should I do now?

Built with **Bun + Hono**.

## Features

- CLI-first incident triage
- FULL MODE for engineering/debug visibility with `panic check --full`
- PANIC MODE for 4-line outage decisions with `panic emergency`
- HTTP health checks
- TCP health checks for DB, Redis, queues, brokers, and internal services
- Unified service health report
- Human-readable incident summaries
- Simple rule-based probable root cause heuristics
- Actionable recovery suggestions
- Optional lightweight Hono JSON API

## Dual-mode design

Panic Tool intentionally separates understanding from action.

### FULL MODE: understand the system

Triggered by:

```bash
panic check --full
```

Use FULL MODE when you need engineering/debug visibility. It includes service status, latency, dependency status, optional log summaries from config, matched rule, explanation, and suggested next action.

FULL MODE is informative, structured, and calm. It does not force a decision.

### PANIC MODE: fix the system now

Triggered by:

```bash
panic emergency
```

Use PANIC MODE during an active outage. It always prints exactly four decision lines:

```text
WHAT: ...
ROOT CAUSE: ...
IMPACT: ...
NEXT ACTION: ...
```

PANIC MODE is intentionally minimal, decisive, and authoritative. It does not include extra debugging detail.

## Install

Panic Tool is published on npm as `@rekl0w/panic-tool`.

> Runtime requirement: Bun 1.3.11+ must be installed because the CLI binary runs on the Bun runtime.

### npm

Install globally:

```bash
npm install -g @rekl0w/panic-tool
```

Run without global install:

```bash
npx @rekl0w/panic-tool@latest check
```

You can also use `npm exec`:

```bash
npm exec @rekl0w/panic-tool@latest -- incident --config ./panic.demo.config.json
```

### Bun

Install globally:

```bash
bun add -g @rekl0w/panic-tool
```

Run without global install:

```bash
bunx @rekl0w/panic-tool@latest check
```

## Quick start

Create a config file after installing globally with npm or Bun:

```bash
panic init
```

Edit `panic.config.json` with your services, then run:

```bash
panic check
panic check --full
panic status
panic emergency
panic incident
```

Prefer one-shot usage instead of global install? Use either runner:

```bash
npx @rekl0w/panic-tool@latest incident --config ./panic.demo.config.json
bunx @rekl0w/panic-tool@latest emergency --config ./panic.demo.config.json
```

Use a custom config file:

```bash
panic incident --config ./prod.panic.json
```

## Try it without your own infrastructure

This repo includes `panic.demo.config.json`, which uses public GitHub endpoints plus one intentionally failing local TCP check so you can see incident output immediately.

```bash
panic check --config ./panic.demo.config.json
panic check --full --config ./panic.demo.config.json
panic emergency --config ./panic.demo.config.json
panic incident --config ./panic.demo.config.json
```

Without global install:

```bash
npx @rekl0w/panic-tool@latest check --config ./panic.demo.config.json
bunx @rekl0w/panic-tool@latest emergency --config ./panic.demo.config.json
```

Useful public targets for manual testing:

- `https://api.github.com` — public HTTP endpoint
- `https://www.githubstatus.com/api/v2/status.json` — public status JSON endpoint
- `github.com:443` — public TCP/TLS target
- `127.0.0.1:65432` — intentionally failing TCP target for demo incidents

If you want an open-source app to test against, use any repo/service that exposes a `/health`, `/ready`, `/status`, or similar endpoint. Panic Tool only needs HTTP URLs or TCP host/port targets; it does not require Sentry, Datadog, Prometheus, or logs.

## Config example

```json
{
  "timeoutMs": 2000,
  "latencyWarningMs": 750,
  "services": [
    {
      "name": "api",
      "type": "http",
      "url": "https://api.example.com/health",
      "critical": true,
      "dependsOn": ["db", "redis"],
      "logSummary": "Recent errors show upstream dependency timeouts."
    },
    {
      "name": "db",
      "type": "tcp",
      "host": "localhost",
      "port": 5432,
      "critical": true,
      "logSummary": "Connection pool near limit; recent timeout spikes."
    },
    {
      "name": "redis",
      "type": "tcp",
      "host": "localhost",
      "port": 6379,
      "critical": false,
      "logSummary": "Eviction count normal; memory pressure unknown."
    }
  ]
}
```

## CLI usage

### `panic check`

Runs all configured checks and prints a terminal-friendly health report.

```bash
panic check
```

Example:

```text
Panic Tool — Health Check
=========================

✅ api          healthy     121ms https://api.example.com/health critical — HTTP health check passed
❌ db           down       2001ms localhost:5432 critical — TCP timeout after 2000ms
⚠️  redis        degraded    812ms localhost:6379 — Slow TCP connection (812ms)
✅ queue        healthy      96ms https://queue.example.com/health — HTTP health check passed
```

### `panic check --full`

Runs FULL MODE for engineering/debug visibility.

```bash
panic check --full
```

Example:

```text
Panic Tool — Full System Check
==============================

Overall: DOWN
Checked: 2026-04-26T10:12:00.000Z

Services:
  - api
    status     : DOWN
    type       : http
    target     : https://api.example.com/health
    latency    : 1800ms
    critical   : yes
    message    : HTTP 503
  - db
    status     : DOWN
    type       : tcp
    target     : localhost:5432
    latency    : 2001ms
    critical   : yes
    message    : TCP timeout after 2000ms

Dependencies:
  - api: db=DOWN, redis=OK
  - db: none

Log summaries:
  - api: Recent errors show upstream dependency timeouts.
  - db: Connection pool near limit; recent timeout spikes.

Rule engine:
  Rule       : DB_DOWN_API_DOWN
  Cause      : Database failure is causing API failure.
  Explanation: Rule DB_DOWN_API_DOWN matched: database is DOWN while API is DOWN.

Suggested next action:
  Check database availability and connection pool before restarting the API.
```

### `panic status`

Shows a compact operational status summary.

```bash
panic status
```

Example:

```text
Panic Tool — Status
===================

Failing : 1
Degraded: 1
Healthy : 2

Critical failures:
  - db: TCP timeout after 2000ms (2001ms)
```

### `panic emergency`

Runs PANIC MODE for an active incident. The output is intentionally limited to four lines.

```bash
panic emergency
```

Example:

```text
WHAT: api, db is DOWN.
ROOT CAUSE: Database failure is causing API failure. Rule DB_DOWN_API_DOWN matched: database is DOWN while API is DOWN.
IMPACT: Critical outage affecting api, db.
NEXT ACTION: Check database availability and connection pool before restarting the API.
```

### `panic incident`

Generates a human-readable triage summary with probable root cause hints and recovery suggestions.

```bash
panic incident
```

Example:

```text
Panic Tool — Incident Triage
============================

❌ Overall: DOWN
Checked: 2026-04-26T10:12:00.000Z

Summary:
  Overall status is DOWN. 1 failing, 1 degraded, 2 healthy. Most likely: Database is down, so API failures are likely caused by unavailable DB connections.

Failing:
  - db: TCP timeout after 2000ms (2001ms)

Degraded:
  - redis: Slow TCP connection (812ms) (812ms)

Healthy:
  - api: HTTP health check passed (121ms)
  - queue: HTTP health check passed (96ms)

Probable root cause:
  - Database is down, so API failures are likely caused by unavailable DB connections.
  - High latency detected in redis; check downstream dependencies and saturation.

What to do now:
  1. Check db logs and restart the service if it is safe.
  2. Verify network access, port, credentials, and connection pool limits for db.
  3. Check DB availability, max connections, slow queries, replication lag, and recent migrations.
```

## Lightweight backend

Panic Tool also ships a small Hono backend for JSON output.

Run locally from the repository:

```bash
bun run dev
```

Endpoints:

- `GET /` — service metadata
- `GET /health` — raw check results
- `GET /status` — compact status JSON
- `GET /incident` — summary, root-cause hints, and suggestions
- `GET /emergency` — panic-mode decision object

Default port is `3030`. Override it with `PORT`.

## Architecture

```text
+--------------------+        +-------------------------+
| panic CLI          |        | Hono lightweight backend |
|                    |        |                         |
| panic check        |        | GET /health             |
| panic check --full |        | GET /status             |
| panic emergency    |        | GET /emergency          |
| panic incident     |        | GET /incident           |
+---------+----------+        +------------+------------+
          |                                |
          +---------------+----------------+
                          |
                          v
              +-----------------------+
              | Health aggregator     |
              | - HTTP checks         |
              | - TCP checks          |
              | - latency thresholds  |
              +-----------+-----------+
                          |
                          v
              +-----------------------+
              | Dual-mode engine      |
              | - FULL MODE details   |
              | - PANIC MODE decision |
              | - deterministic rules |
              | - next action         |
              +-----------------------+
```

## Project structure

```text
panic-tool/
├── src/
│   ├── checkers.ts     # HTTP + TCP health checks
│   ├── cli.ts          # panic check/status/incident commands
│   ├── config.ts       # JSON config loading + validation
│   ├── format.ts       # terminal-friendly output formatting
│   ├── incident.ts     # summaries, heuristics, suggestions
│   ├── index.ts        # public exports
│   ├── server.ts       # Hono backend
│   └── types.ts        # shared TypeScript types
├── scripts/build.ts    # npm package build script
├── panic.config.example.json
├── panic.demo.config.json
├── package.json
├── tsconfig.json
└── README.md
```

## Development

Install dependencies:

```bash
bun install
```

Run typecheck:

```bash
bun run typecheck
```

Build package output:

```bash
bun run build
```

Run CLI from source:

```bash
bun run src/cli.ts check --full --config ./panic.demo.config.json
bun run src/cli.ts emergency --config ./panic.demo.config.json
```

Preview the npm package contents before publishing:

```bash
npm pack --dry-run
```

Publish checklist:

```bash
npm login
npm whoami
npm pkg fix
bun run typecheck
bun run build
npm publish --access public
```

If publishing `@rekl0w/panic-tool` returns `E404`, check that the logged-in npm account owns the `@rekl0w` scope. For scoped packages, npm scopes are tied to npm users or npm organizations, not GitHub users automatically.

Publish after login and scope verification:

```bash
npm publish --access public
```

## Design principles

- CLI-first
- Keep FULL MODE and PANIC MODE separate
- Small architecture, no microservices
- Rule-based heuristics, no heavy ML
- Fast triage over historical forensics
- Suggestions should be operationally useful
- No dashboard in the MVP

## Non-goals

- No observability platform
- No tracing system
- No log ingestion pipeline
- No Sentry or Datadog clone behavior
- No ML-heavy root-cause analysis

## Roadmap

- `--json` CLI output
- YAML config support
- Docker image
- GitHub Actions release workflow
- Pluggable checks for Kubernetes, systemd, and cloud load balancers
- Configurable custom rule packs

## Release notes

See [`CHANGELOG.md`](./CHANGELOG.md) for version history.

Latest release: [`v0.2.0`](./CHANGELOG.md#020---2026-04-26)

## Contributing

Issues and pull requests are welcome. Please keep contributions aligned with the product scope: fast incident triage and actionable recovery suggestions.

See [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## License

MIT

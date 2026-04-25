# Changelog

All notable changes to this project will be documented in this file.

The format is inspired by [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows semantic versioning from `v0.1.0` onward.

## 0.2.0 - 2026-04-26

Dual-mode incident response release.

### 0.2.0 Added

- FULL MODE via `panic check --full` for engineering/debug visibility.
- PANIC MODE via `panic emergency` for strict four-line outage decisions.
- Deterministic single-cause root cause decision model with rule names and explanations.
- Mandatory prioritized `NEXT ACTION` output for emergency decisions.
- Impact line generation for panic-mode output.
- Normalized full-mode statuses using `OK`, `DEGRADED`, and `DOWN`.
- Dependency status section in full-mode output.
- Optional `logSummary` field in service config for full-mode log context.
- `GET /emergency` backend endpoint for panic-mode decision data.
- `emergency` npm script for local development.

### 0.2.0 Changed

- Bumped package version to `0.2.0`.
- Updated README around dual-mode product architecture and npm/Bun usage examples.
- Enriched example and demo configs with dependency and log summary metadata.

### 0.2.0 Notes

- FULL MODE is intentionally detailed and calm.
- PANIC MODE is intentionally minimal and must not include extra diagnostic noise.
- Rule-based decisions remain deterministic; no AI or ML inference is used.

## 0.1.0 - 2026-04-26

Initial MVP release of Panic Tool.

### 0.1.0 Added

- CLI package published as `@rekl0w/panic-tool` with `panic` binary.
- `panic check` command for terminal-friendly multi-service health reports.
- `panic status` command for compact incident status summaries.
- `panic incident` command for human-readable triage output.
- `panic init` command to create `panic.config.json` from the example config.
- HTTP health checks with expected status support.
- TCP health checks for services such as databases, Redis, queues, brokers, and internal dependencies.
- Configurable timeout and latency warning thresholds.
- Dependency-aware service config via `dependsOn`.
- Rule-based probable root cause heuristics, including DB/API, Redis/queue, and high-latency patterns.
- Actionable recovery suggestions focused on what to do during an incident.
- Lightweight Hono backend with JSON endpoints:
  - `GET /`
  - `GET /health`
  - `GET /status`
  - `GET /incident`
- Demo config using public endpoints plus an intentionally failing TCP target for quick testing.
- TypeScript declarations for package consumers.
- GitHub Actions CI workflow for typechecking.
- Open-source project docs, contribution guide, MIT license, and npm package metadata.

### 0.1.0 Notes

- This is intentionally not an observability platform, dashboard, tracing system, log collector, alerting system, or Sentry clone.
- The MVP focuses on fast production incident triage: what is broken, what is probably causing it, and what to do now.
- Bun 1.3.11+ is required at runtime because the CLI binary targets Bun.

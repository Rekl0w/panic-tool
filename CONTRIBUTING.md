# Contributing

Thanks for helping improve Panic Tool.

## Local development

1. Install Bun 1.1+
2. Run `bun install`
3. Copy `panic.config.example.json` to `panic.config.json`
4. Run `bun run typecheck`

## Scope

This project is intentionally small. Contributions should keep the product focused on incident triage:

- Health checks
- Incident summaries
- Simple root-cause heuristics
- Actionable recovery suggestions
- CLI-first workflows

Please avoid dashboard, tracing, log ingestion, alerting, or Sentry/Datadog clone features in the MVP.

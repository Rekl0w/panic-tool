export type ServiceType = "http" | "tcp";

export type HealthStatus = "healthy" | "degraded" | "down" | "unknown";

export interface ServiceConfig {
  name: string;
  type: ServiceType;
  url?: string;
  host?: string;
  port?: number;
  critical?: boolean;
  dependsOn?: string[];
  timeoutMs?: number;
  expectedStatus?: number[];
}

export interface PanicConfig {
  services: ServiceConfig[];
  timeoutMs?: number;
  latencyWarningMs?: number;
}

export interface HealthCheckResult {
  service: string;
  type: ServiceType;
  status: HealthStatus;
  latencyMs: number;
  critical: boolean;
  checkedAt: string;
  target: string;
  message: string;
  dependsOn: string[];
}

export interface IncidentSummary {
  overallStatus: HealthStatus;
  failing: HealthCheckResult[];
  degraded: HealthCheckResult[];
  healthy: HealthCheckResult[];
  rootCauses: string[];
  suggestions: string[];
  narrative: string;
  checkedAt: string;
}

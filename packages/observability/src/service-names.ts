/**
 * Canonical SERVICE_NAME values. Dashboards, metric filters, and log
 * Insights queries assume these exact strings — do not invent aliases
 * (web / frontend / nextjs / api).
 */
export const SERVICE_NAMES = {
  web: "aicatalyst-web",
  api: "aicatalyst-api",
  mcp: "aicatalyst-mcp",
  services: "aicatalyst-services",
} as const;

export type ServiceName = (typeof SERVICE_NAMES)[keyof typeof SERVICE_NAMES];

const SERVICE_NAME_SET = new Set<string>(Object.values(SERVICE_NAMES));

export function isServiceName(value: string): value is ServiceName {
  return SERVICE_NAME_SET.has(value);
}

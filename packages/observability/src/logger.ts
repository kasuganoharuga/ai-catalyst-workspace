import {
  isJsonLogMode,
  resolveAppEnv,
  resolveLogLevel,
  resolveRelease,
  resolveServiceName,
  type AppEnv,
  type LogLevel,
} from "@ai-catalyst/observability/env";
import { redactLogFields } from "@ai-catalyst/observability/redact";
import {
  SERVICE_NAMES,
  type ServiceName,
} from "@ai-catalyst/observability/service-names";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export type LogBindings = {
  service?: ServiceName;
  environment?: AppEnv;
  release?: string;
  trace_id?: string;
  request_id?: string;
  [key: string]: unknown;
};

/**
 * Every structured log requires a stable machine `event` (snake_case) for
 * CloudWatch Insights / metric filters. `message` is human-readable only.
 */
export type LogRecord = {
  event: string;
  message?: string;
  [key: string]: unknown;
};

export type Logger = {
  debug: (record: LogRecord) => void;
  info: (record: LogRecord) => void;
  warn: (record: LogRecord) => void;
  error: (record: LogRecord) => void;
  child: (bindings: LogBindings) => Logger;
};

export type CreateLoggerOptions = {
  service?: ServiceName;
  environment?: AppEnv;
  release?: string;
  level?: LogLevel;
  bindings?: LogBindings;
  /**
   * Override stdout sink (tests). Defaults to console methods.
   */
  write?: (
    level: LogLevel,
    line: string,
    fields: Record<string, unknown>,
  ) => void;
};

function defaultWrite(
  level: LogLevel,
  line: string,
  _fields: Record<string, unknown>,
): void {
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  // info + debug — CloudWatch captures stdout
  console.log(line);
}

function formatConsoleLine(
  level: LogLevel,
  fields: Record<string, unknown>,
): string {
  const event = typeof fields.event === "string" ? fields.event : "log";
  const message =
    typeof fields.message === "string" ? fields.message : undefined;
  const {
    event: _e,
    message: _m,
    level: _l,
    service,
    environment,
    ...rest
  } = fields;
  const meta = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : "";
  const prefix = [service, environment].filter(Boolean).join("/");
  return message
    ? `${level.toUpperCase()} [${prefix}] ${event}: ${message}${meta}`
    : `${level.toUpperCase()} [${prefix}] ${event}${meta}`;
}

export function createLogger(options: CreateLoggerOptions = {}): Logger {
  const environment = options.environment ?? resolveAppEnv();
  const service =
    options.service ?? resolveServiceName(undefined, SERVICE_NAMES.services);
  const release = options.release ?? resolveRelease();
  const minLevel = options.level ?? resolveLogLevel();
  const jsonMode = isJsonLogMode(environment);
  const write = options.write ?? defaultWrite;
  const baseBindings: LogBindings = {
    service,
    environment,
    ...(release ? { release } : {}),
    ...options.bindings,
  };

  const emit = (level: LogLevel, record: LogRecord): void => {
    try {
      if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) {
        return;
      }
      if (typeof record.event !== "string" || record.event.length === 0) {
        return;
      }
      const merged = redactLogFields({
        ...baseBindings,
        ...record,
        level,
        timestamp: new Date().toISOString(),
      });
      const line = jsonMode
        ? JSON.stringify(merged)
        : formatConsoleLine(level, merged);
      write(level, line, merged);
    } catch {
      // Best-effort: never throw into the request path.
    }
  };

  const logger: Logger = {
    debug: (record) => emit("debug", record),
    info: (record) => emit("info", record),
    warn: (record) => emit("warn", record),
    error: (record) => emit("error", record),
    child: (bindings) =>
      createLogger({
        service,
        environment,
        release,
        level: minLevel,
        write,
        bindings: { ...baseBindings, ...bindings },
      }),
  };

  return logger;
}

export function loggerForService(service: ServiceName): Logger {
  return createLogger({ service });
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  requestId?: string;
  userId?: string;
  action?: string;
  service?: string;
  details?: Record<string, unknown>;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getConfiguredLevel(): LogLevel {
  const raw = (process.env["LOG_LEVEL"] ?? "info").toLowerCase();
  if (raw in LOG_LEVELS) return raw as LogLevel;
  return "info";
}

export class Logger {
  private context: LogContext;
  private minLevel: number;

  constructor(context: LogContext = {}) {
    this.context = context;
    this.minLevel = LOG_LEVELS[getConfiguredLevel()];
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= this.minLevel;
  }

  private log(level: LogLevel, message: string, extra?: Record<string, unknown>) {
    if (!this.shouldLog(level)) return;

    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...this.context,
      ...extra,
    };
    // Write to stdout — Docker / process manager handles rotation
    process.stdout.write(JSON.stringify(logEntry) + "\n");
  }

  debug(message: string, extra?: Record<string, unknown>) {
    this.log("debug", message, extra);
  }

  info(message: string, extra?: Record<string, unknown>) {
    this.log("info", message, extra);
  }

  warn(message: string, extra?: Record<string, unknown>) {
    this.log("warn", message, extra);
  }

  error(message: string, error?: Error | unknown, extra?: Record<string, unknown>) {
    const errorInfo =
      error instanceof Error
        ? { error: error.message, stack: error.stack }
        : { error: String(error) };
    this.log("error", message, { ...errorInfo, ...extra });
  }

  child(context: Partial<LogContext>): Logger {
    return new Logger({ ...this.context, ...context });
  }
}

export const createLogger = (context?: LogContext) => new Logger(context);

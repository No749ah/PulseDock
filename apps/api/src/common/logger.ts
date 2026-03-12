export interface LogContext {
  requestId?: string;
  userId?: string;
  action?: string;
  service?: string;
  details?: Record<string, unknown>;
}

export class Logger {
  private context: LogContext;

  constructor(context: LogContext = {}) {
    this.context = context;
  }

  private log(level: "info" | "warn" | "error", message: string, extra?: Record<string, unknown>) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...this.context,
      ...extra,
    };
    console.log(JSON.stringify(logEntry));
  }

  info(message: string, extra?: Record<string, unknown>) {
    this.log("info", message, extra);
  }

  warn(message: string, extra?: Record<string, unknown>) {
    this.log("warn", message, extra);
  }

  error(message: string, error?: Error | unknown, extra?: Record<string, unknown>) {
    const errorInfo = error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) };
    this.log("error", message, { ...errorInfo, ...extra });
  }

  child(context: Partial<LogContext>): Logger {
    return new Logger({ ...this.context, ...context });
  }
}

export const createLogger = (context?: LogContext) => new Logger(context);

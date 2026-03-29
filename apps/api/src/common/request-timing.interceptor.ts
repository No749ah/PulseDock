import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';

@Injectable()
export class RequestTimingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestTimingInterceptor.name);
  private readonly warnThresholdMs: number;
  private readonly errorThresholdMs: number;

  constructor(warnThresholdMs = 1000, errorThresholdMs = 5000) {
    this.warnThresholdMs = warnThresholdMs;
    this.errorThresholdMs = errorThresholdMs;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const start = Date.now();
    const http = context.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();

    return next.handle().pipe(
      tap(() => {
        const durationMs = Date.now() - start;
        const method: string = req.method;
        const path: string = req.url ?? req.path;
        const statusCode: number = res.statusCode;

        res.setHeader('X-Response-Time', `${durationMs}ms`);

        const logPayload = { method, path, statusCode, durationMs };

        if (durationMs >= this.errorThresholdMs) {
          this.logger.error(
            `Slow request: ${method} ${path} ${statusCode} — ${durationMs}ms`,
            JSON.stringify(logPayload),
          );
        } else if (durationMs >= this.warnThresholdMs) {
          this.logger.warn(
            `Slow request: ${method} ${path} ${statusCode} — ${durationMs}ms`,
            JSON.stringify(logPayload),
          );
        }
      }),
    );
  }
}

import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest<{ requestId?: string; method?: string; url?: string }>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    let message = 'Internal server error';
    let code = 'INTERNAL_ERROR';

    if (isHttp) {
      const res = exception.getResponse() as any;
      if (typeof res === 'string') message = res;
      else if (Array.isArray(res?.message)) message = res.message.join(', ');
      else if (typeof res?.message === 'string') message = res.message;
      code = (res?.error ?? exception.name ?? 'HTTP_ERROR').toString().toUpperCase().replace(/\s+/g, '_');
    }

    response.status(status).json({
      ok: false,
      error: {
        code,
        message,
        status,
      },
      requestId: request.requestId ?? null,
      timestamp: new Date().toISOString(),
      path: request.url ?? null,
      method: request.method ?? null,
    });
  }
}

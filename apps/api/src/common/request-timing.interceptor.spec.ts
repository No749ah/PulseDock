import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RequestTimingInterceptor } from './request-timing.interceptor';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, lastValueFrom } from 'rxjs';

function createMockContext(method = 'GET', url = '/test', statusCode = 200) {
  const req = { method, url };
  const res = {
    statusCode,
    setHeader: vi.fn(),
  };
  const ctx = {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as unknown as ExecutionContext;
  return { ctx, req, res };
}

function createCallHandler(result: unknown = 'ok'): CallHandler {
  return { handle: () => of(result) };
}

describe('RequestTimingInterceptor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should set X-Response-Time header on the response', async () => {
    const interceptor = new RequestTimingInterceptor();
    const { ctx, res } = createMockContext();
    await lastValueFrom(interceptor.intercept(ctx, createCallHandler()));

    expect(res.setHeader).toHaveBeenCalledWith(
      'X-Response-Time',
      expect.stringMatching(/^\d+ms$/),
    );
  });

  it('should pass through the handler result', async () => {
    const interceptor = new RequestTimingInterceptor();
    const { ctx } = createMockContext();
    const value = await lastValueFrom(interceptor.intercept(ctx, createCallHandler('payload')));
    expect(value).toBe('payload');
  });

  it('should not log for fast requests (< warnThreshold)', async () => {
    const interceptor = new RequestTimingInterceptor(1000, 5000);
    const wSpy = vi.spyOn((interceptor as any).logger, 'warn').mockImplementation(() => {});
    const eSpy = vi.spyOn((interceptor as any).logger, 'error').mockImplementation(() => {});

    const { ctx } = createMockContext();
    await lastValueFrom(interceptor.intercept(ctx, createCallHandler()));

    expect(wSpy).not.toHaveBeenCalled();
    expect(eSpy).not.toHaveBeenCalled();
  });

  it('should log a warning for requests above warnThreshold', async () => {
    // warnThreshold=0 so any request triggers warn; errorThreshold very high
    const interceptor = new RequestTimingInterceptor(0, 999999);
    const wSpy = vi.spyOn((interceptor as any).logger, 'warn').mockImplementation(() => {});
    vi.spyOn((interceptor as any).logger, 'error').mockImplementation(() => {});

    const { ctx } = createMockContext('POST', '/slow');
    await lastValueFrom(interceptor.intercept(ctx, createCallHandler()));

    expect(wSpy).toHaveBeenCalledTimes(1);
    expect(wSpy.mock.calls[0][0]).toContain('Slow request');
    expect(wSpy.mock.calls[0][0]).toContain('POST');
    expect(wSpy.mock.calls[0][0]).toContain('/slow');
  });

  it('should log an error for requests above errorThreshold', async () => {
    // Both thresholds at 0 — error takes precedence
    const interceptor = new RequestTimingInterceptor(0, 0);
    vi.spyOn((interceptor as any).logger, 'warn').mockImplementation(() => {});
    const eSpy = vi.spyOn((interceptor as any).logger, 'error').mockImplementation(() => {});

    const { ctx } = createMockContext('DELETE', '/very-slow');
    await lastValueFrom(interceptor.intercept(ctx, createCallHandler()));

    expect(eSpy).toHaveBeenCalledTimes(1);
    expect(eSpy.mock.calls[0][0]).toContain('DELETE');
    expect(eSpy.mock.calls[0][0]).toContain('/very-slow');
  });

  it('should prefer error over warn when both thresholds are exceeded', async () => {
    const interceptor = new RequestTimingInterceptor(0, 0);
    const wSpy = vi.spyOn((interceptor as any).logger, 'warn').mockImplementation(() => {});
    const eSpy = vi.spyOn((interceptor as any).logger, 'error').mockImplementation(() => {});

    const { ctx } = createMockContext();
    await lastValueFrom(interceptor.intercept(ctx, createCallHandler()));

    // error path takes precedence — warn should NOT be called
    expect(eSpy).toHaveBeenCalledTimes(1);
    expect(wSpy).not.toHaveBeenCalled();
  });

  it('should include statusCode and durationMs in log context', async () => {
    const interceptor = new RequestTimingInterceptor(0, 999999);
    const wSpy = vi.spyOn((interceptor as any).logger, 'warn').mockImplementation(() => {});
    vi.spyOn((interceptor as any).logger, 'error').mockImplementation(() => {});

    const { ctx } = createMockContext('GET', '/info', 201);
    await lastValueFrom(interceptor.intercept(ctx, createCallHandler()));

    const contextArg = wSpy.mock.calls[0][1] as string;
    const parsed = JSON.parse(contextArg);
    expect(parsed).toMatchObject({
      method: 'GET',
      path: '/info',
      statusCode: 201,
    });
    expect(parsed.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should use custom thresholds from constructor', async () => {
    // warnThreshold=50ms, errorThreshold=100ms — both above realistic exec time of ~0ms
    const interceptor = new RequestTimingInterceptor(50, 100);
    const wSpy = vi.spyOn((interceptor as any).logger, 'warn').mockImplementation(() => {});
    const eSpy = vi.spyOn((interceptor as any).logger, 'error').mockImplementation(() => {});

    const { ctx } = createMockContext();
    await lastValueFrom(interceptor.intercept(ctx, createCallHandler()));

    // With ~0ms actual duration, neither threshold should fire
    expect(wSpy).not.toHaveBeenCalled();
    expect(eSpy).not.toHaveBeenCalled();
  });
});

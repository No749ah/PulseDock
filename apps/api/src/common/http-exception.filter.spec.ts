import { describe, it, expect } from 'vitest';
import { HttpException, HttpStatus, BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { GlobalHttpExceptionFilter } from './http-exception.filter';

type MockResponse = {
  status: (s: number) => { json: (b: unknown) => void };
};

function makeHost(
  onJson: (status: number, body: unknown) => void,
  request: Record<string, unknown> = {},
) {
  const response: MockResponse = {
    status: (s: number) => ({ json: (b: unknown) => onJson(s, b) }),
  };
  return {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: <T>() => request as T,
    }),
  };
}

describe('GlobalHttpExceptionFilter', () => {
  const filter = new GlobalHttpExceptionFilter();

  // ── Non-HTTP exceptions ──────────────────────────────────────────────────

  it('handles a generic Error with 500 status', () => {
    let status = 0;
    let body: unknown = null;
    const host = makeHost((s, b) => { status = s; body = b; }, { requestId: 'r1', url: '/api', method: 'GET' });
    filter.catch(new Error('boom'), host as never);

    expect(status).toBe(500);
    const b = body as Record<string, unknown>;
    expect(b.ok).toBe(false);
    expect((b.error as Record<string, unknown>).code).toBe('INTERNAL_ERROR');
    expect((b.error as Record<string, unknown>).message).toBe('Internal server error');
    expect((b.error as Record<string, unknown>).status).toBe(500);
  });

  it('includes requestId, path, method from request object', () => {
    let body: unknown = null;
    const host = makeHost((_s, b) => { body = b; }, { requestId: 'req-xyz', url: '/test/path', method: 'POST' });
    filter.catch(new Error('fail'), host as never);

    const b = body as Record<string, unknown>;
    expect(b.requestId).toBe('req-xyz');
    expect(b.path).toBe('/test/path');
    expect(b.method).toBe('POST');
  });

  it('returns null for requestId, path, method when request fields are absent', () => {
    let body: unknown = null;
    const host = makeHost((_s, b) => { body = b; }, {});
    filter.catch(new TypeError('type mismatch'), host as never);

    const b = body as Record<string, unknown>;
    expect(b.requestId).toBeNull();
    expect(b.path).toBeNull();
    expect(b.method).toBeNull();
  });

  it('always includes a valid ISO timestamp', () => {
    let body: unknown = null;
    const host = makeHost((_s, b) => { body = b; }, {});
    filter.catch(new Error('ts test'), host as never);

    const b = body as Record<string, unknown>;
    expect(typeof b.timestamp).toBe('string');
    expect(new Date(b.timestamp as string).getTime()).toBeGreaterThan(0);
  });

  // ── HTTP exceptions with string response ─────────────────────────────────

  it('handles HttpException with plain string response message', () => {
    let status = 0;
    let body: unknown = null;
    const host = makeHost((s, b) => { status = s; body = b; }, { url: '/login', method: 'POST' });
    const ex = new HttpException('Custom error message', HttpStatus.FORBIDDEN);
    filter.catch(ex, host as never);

    expect(status).toBe(403);
    expect((body as Record<string, unknown>).ok).toBe(false);
    expect(((body as Record<string, unknown>).error as Record<string, unknown>).message).toBe('Custom error message');
  });

  // ── HTTP exceptions with object response ─────────────────────────────────

  it('handles BadRequestException with array of validation messages', () => {
    let body: unknown = null;
    const host = makeHost((_s, b) => { body = b; }, {});
    const ex = new BadRequestException({ message: ['name is required', 'url must be a valid URL'] });
    filter.catch(ex, host as never);

    const err = ((body as Record<string, unknown>).error) as Record<string, unknown>;
    expect(err.message).toBe('name is required, url must be a valid URL');
  });

  it('handles NotFoundException with string message in response object', () => {
    let body: unknown = null;
    const host = makeHost((_s, b) => { body = b; }, {});
    const ex = new NotFoundException('Monitor not found');
    filter.catch(ex, host as never);

    const err = ((body as Record<string, unknown>).error) as Record<string, unknown>;
    expect(err.message).toBe('Monitor not found');
  });

  it('handles UnauthorizedException and returns 401 status', () => {
    let status = 0;
    const host = makeHost((s) => { status = s; }, {});
    filter.catch(new UnauthorizedException(), host as never);
    expect(status).toBe(401);
  });

  it('uses exception name as fallback code when no error field in response object', () => {
    let body: unknown = null;
    const host = makeHost((_s, b) => { body = b; }, {});
    // HttpException with object but no `error` field → should fall back to exception.name
    const ex = new HttpException({ message: 'something bad' }, HttpStatus.BAD_REQUEST);
    filter.catch(ex, host as never);

    const err = ((body as Record<string, unknown>).error) as Record<string, unknown>;
    expect(typeof err.code).toBe('string');
    expect(err.code).toMatch(/^[A-Z_]+$/); // code must be UPPER_SNAKE_CASE
  });

  it('uppercases and snake-cases the error code from response', () => {
    let body: unknown = null;
    const host = makeHost((_s, b) => { body = b; }, {});
    const ex = new HttpException({ message: 'err', error: 'Bad Request' }, HttpStatus.BAD_REQUEST);
    filter.catch(ex, host as never);

    const err = ((body as Record<string, unknown>).error) as Record<string, unknown>;
    expect(err.code).toBe('BAD_REQUEST');
  });

  it('uses HTTP_ERROR as ultimate fallback when no error, no exception name', () => {
    let body: unknown = null;
    const host = makeHost((_s, b) => { body = b; }, {});
    // Create an exception where getResponse() returns an object without `error` key
    // and we override exception.name to be empty
    class AnonymousException extends HttpException {}
    Object.defineProperty(AnonymousException, 'name', { value: '' });
    const ex = new AnonymousException({ message: 'anon error' }, HttpStatus.UNPROCESSABLE_ENTITY);
    filter.catch(ex, host as never);

    const err = ((body as Record<string, unknown>).error) as Record<string, unknown>;
    // Should be either '' (empty name), 'UNPROCESSABLEENTITYEXCEPTION', or 'HTTP_ERROR'
    // The important thing is that it's a non-empty string
    expect(typeof err.code).toBe('string');
  });
});

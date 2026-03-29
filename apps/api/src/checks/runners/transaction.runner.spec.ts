import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

// ─── Hoist mock factory so it runs before module imports ─────────────────────

const mockHttpFn = vi.hoisted(() => vi.fn());
const mockHttpsFn = vi.hoisted(() => vi.fn());

vi.mock('http', () => {
  const EventEmitter = require('events').EventEmitter;
  return {
    request: mockHttpFn,
    // expose an Agent class so any http.Agent usage doesn't break
    Agent: class Agent {},
    EventEmitter,
  };
});

vi.mock('https', () => {
  const EventEmitter = require('events').EventEmitter;
  return {
    request: mockHttpsFn,
    Agent: class Agent {},
    EventEmitter,
  };
});

import {
  runTransactionCheck,
  interpolate,
  resolvePath,
  evaluateAssertions,
  type TransactionStep,
} from './transaction.runner';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeFakeResponse(statusCode: number, body: string, headers: Record<string, string> = {}) {
  const res = new EventEmitter() as EventEmitter & { statusCode: number; headers: Record<string, string> };
  res.statusCode = statusCode;
  res.headers = headers;
  return res;
}

function makeFakeReq() {
  const req = new EventEmitter() as EventEmitter & { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
  req.write = vi.fn();
  req.end = vi.fn();
  return req;
}

/** Wire both http.request + https.request to return the same stub response */
function stubRequest(statusCode: number, body: string, headers: Record<string, string> = {}) {
  const fakeRes = makeFakeResponse(statusCode, body, headers);
  const fakeReq = makeFakeReq();

  const impl = (_opts: unknown, cb?: unknown) => {
    if (typeof cb === 'function') {
      setTimeout(() => {
        const fn = cb as (res: unknown) => void;
        fn(fakeRes);
        setTimeout(() => {
          fakeRes.emit('data', Buffer.from(body));
          fakeRes.emit('end');
        }, 5);
      }, 0);
    }
    return fakeReq;
  };

  mockHttpFn.mockImplementation(impl);
  mockHttpsFn.mockImplementation(impl);
  return { fakeReq, fakeRes };
}

// ─── Pure-function unit tests (no http mocking needed) ────────────────────────

describe('interpolate()', () => {
  it('replaces known vars', () => {
    expect(interpolate('Hello {{name}}!', { name: 'World' })).toBe('Hello World!');
  });
  it('leaves unknown vars as-is', () => {
    expect(interpolate('{{unknown}}', {})).toBe('{{unknown}}');
  });
});

describe('resolvePath()', () => {
  it('resolves nested dot path', () => {
    expect(resolvePath({ data: { token: 'abc' } }, 'data.token')).toBe('abc');
  });
  it('returns undefined for missing path', () => {
    expect(resolvePath({ a: 1 }, 'a.b.c')).toBeUndefined();
  });
});

describe('evaluateAssertions()', () => {
  it('passes status assertion on match', () => {
    const failures = evaluateAssertions([{ type: 'status', value: '200' }], 200, '', {}, 50);
    expect(failures).toHaveLength(0);
  });
  it('fails status assertion on mismatch', () => {
    const failures = evaluateAssertions([{ type: 'status', value: '201' }], 200, '', {}, 50);
    expect(failures[0]).toContain('Expected status 201, got 200');
  });
  it('passes body_contains assertion', () => {
    const failures = evaluateAssertions([{ type: 'body_contains', value: 'success' }], 200, '{"status":"success"}', {}, 50);
    expect(failures).toHaveLength(0);
  });
  it('fails body_contains assertion', () => {
    const failures = evaluateAssertions([{ type: 'body_contains', value: 'ok' }], 200, 'not here', {}, 50);
    expect(failures[0]).toContain('Body does not contain');
  });
  it('passes json_path assertion', () => {
    const failures = evaluateAssertions([{ type: 'json_path', value: 'status', expected: 'ok' }], 200, '{"status":"ok"}', {}, 50);
    expect(failures).toHaveLength(0);
  });
  it('fails json_path assertion on wrong value', () => {
    const failures = evaluateAssertions([{ type: 'json_path', value: 'status', expected: 'ok' }], 200, '{"status":"fail"}', {}, 50);
    expect(failures[0]).toContain('expected "ok", got "fail"');
  });
  it('passes header_exists assertion', () => {
    const failures = evaluateAssertions([{ type: 'header_exists', value: 'x-request-id' }], 200, '', { 'x-request-id': 'abc' }, 50);
    expect(failures).toHaveLength(0);
  });
  it('fails latency_lt assertion', () => {
    const failures = evaluateAssertions([{ type: 'latency_lt', value: '100' }], 200, '', {}, 200);
    expect(failures[0]).toContain('Latency 200ms exceeds threshold 100ms');
  });
});

// ─── runTransactionCheck() ────────────────────────────────────────────────────

describe('runTransactionCheck()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when no steps', async () => {
    const result = await runTransactionCheck([]);
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.message).toContain('no steps');
  });

  it('single step success returns ok=true, green', async () => {
    stubRequest(200, '{"status":"ok"}');
    const steps: TransactionStep[] = [{ id: '1', name: 'Health', method: 'GET', url: 'http://example.com/health' }];
    const result = await runTransactionCheck(steps);
    expect(result.ok).toBe(true);
    expect(result.level).toBe('green');
    const tx = (result.metadata as { transactionResult: { steps: Array<{ ok: boolean }> } }).transactionResult;
    expect(tx.steps[0].ok).toBe(true);
  });

  it('extracts variable from step 1 and injects into step 2 URL', async () => {
    let callCount = 0;
    const impl = (_opts: unknown, cb?: unknown) => {
      const fakeReq = makeFakeReq();
      const body = callCount === 0 ? '{"data":{"userId":"user-42"}}' : '{"name":"John"}';
      const fakeRes = makeFakeResponse(200, body);
      callCount++;
      if (typeof cb === 'function') {
        setTimeout(() => {
          (cb as (r: unknown) => void)(fakeRes);
          setTimeout(() => { fakeRes.emit('data', Buffer.from(body)); fakeRes.emit('end'); }, 5);
        }, 0);
      }
      return fakeReq;
    };
    mockHttpFn.mockImplementation(impl);
    mockHttpsFn.mockImplementation(impl);

    const steps: TransactionStep[] = [
      { id: '1', name: 'Login', method: 'POST', url: 'https://api.example.com/login', extract: { userId: 'data.userId' } },
      { id: '2', name: 'Profile', method: 'GET', url: 'https://api.example.com/users/{{userId}}' },
    ];
    const result = await runTransactionCheck(steps);
    expect(result.ok).toBe(true);
    const tx = (result.metadata as { transactionResult: { steps: Array<{ extractedVars?: Record<string, string> }> } }).transactionResult;
    expect(tx.steps[0].extractedVars?.userId).toBe('user-42');
  });

  it('assertion failure → level=yellow, ok=false', async () => {
    stubRequest(200, '{"status":"fail"}');
    const steps: TransactionStep[] = [{
      id: '1', name: 'Check', method: 'GET', url: 'http://example.com/check',
      assertions: [{ type: 'body_contains', value: 'ok' }],
    }];
    const result = await runTransactionCheck(steps);
    expect(result.ok).toBe(false);
    expect(result.level).toBe('yellow');
  });

  it('4xx/5xx status → red level, ok=false', async () => {
    stubRequest(503, 'Service Unavailable');
    const steps: TransactionStep[] = [{ id: '1', name: 'Fail', method: 'GET', url: 'http://example.com' }];
    const result = await runTransactionCheck(steps);
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
  });

  it('stops at first failure by default (continueOnFailure=false)', async () => {
    let callCount = 0;
    const impl = (_opts: unknown, cb?: unknown) => {
      const fakeReq = makeFakeReq();
      callCount++;
      const body = callCount === 1 ? 'bad' : 'ok';
      const statusCode = callCount === 1 ? 500 : 200;
      const fakeRes = makeFakeResponse(statusCode, body);
      if (typeof cb === 'function') {
        setTimeout(() => {
          (cb as (r: unknown) => void)(fakeRes);
          setTimeout(() => { fakeRes.emit('data', Buffer.from(body)); fakeRes.emit('end'); }, 5);
        }, 0);
      }
      return fakeReq;
    };
    mockHttpFn.mockImplementation(impl);
    mockHttpsFn.mockImplementation(impl);

    const steps: TransactionStep[] = [
      { id: '1', name: 'Step1', method: 'GET', url: 'http://example.com/step1' },
      { id: '2', name: 'Step2', method: 'GET', url: 'http://example.com/step2' },
    ];
    const result = await runTransactionCheck(steps, {}, false);
    expect(callCount).toBe(1); // stopped after first failure
    const tx = (result.metadata as { transactionResult: { steps: Array<{ ok: boolean }> } }).transactionResult;
    expect(tx.steps).toHaveLength(1);
  });

  it('continueOnFailure=true runs all steps even if one fails', async () => {
    let callCount = 0;
    const impl = (_opts: unknown, cb?: unknown) => {
      const fakeReq = makeFakeReq();
      callCount++;
      const body = callCount === 1 ? 'bad' : 'ok';
      const statusCode = callCount === 1 ? 500 : 200;
      const fakeRes = makeFakeResponse(statusCode, body);
      if (typeof cb === 'function') {
        setTimeout(() => {
          (cb as (r: unknown) => void)(fakeRes);
          setTimeout(() => { fakeRes.emit('data', Buffer.from(body)); fakeRes.emit('end'); }, 5);
        }, 0);
      }
      return fakeReq;
    };
    mockHttpFn.mockImplementation(impl);
    mockHttpsFn.mockImplementation(impl);

    const steps: TransactionStep[] = [
      { id: '1', name: 'Step1', method: 'GET', url: 'http://example.com/step1' },
      { id: '2', name: 'Step2', method: 'GET', url: 'http://example.com/step2' },
    ];
    const result = await runTransactionCheck(steps, {}, true);
    expect(callCount).toBe(2); // all steps ran
    const tx = (result.metadata as { transactionResult: { steps: Array<{ ok: boolean }> } }).transactionResult;
    expect(tx.steps).toHaveLength(2);
    expect(tx.steps[1].ok).toBe(true);
    expect(result.ok).toBe(false); // overall still fails
  });

  it('network error → red level', async () => {
    const impl = (_opts: unknown, _cb?: unknown) => {
      const fakeReq = makeFakeReq();
      fakeReq.end = vi.fn(() => {
        setTimeout(() => fakeReq.emit('error', new Error('ECONNREFUSED')), 0);
      });
      return fakeReq;
    };
    mockHttpFn.mockImplementation(impl);
    mockHttpsFn.mockImplementation(impl);

    const steps: TransactionStep[] = [{ id: '1', name: 'Fail', method: 'GET', url: 'http://localhost:9999' }];
    const result = await runTransactionCheck(steps);
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    const tx = (result.metadata as { transactionResult: { steps: Array<{ error?: string }> } }).transactionResult;
    expect(tx.steps[0].error).toContain('ECONNREFUSED');
  });

  it('passes initialVars into first step URL', async () => {
    let capturedPath = '';
    const impl = (opts: unknown, cb?: unknown) => {
      capturedPath = (opts as { path: string }).path ?? '';
      const fakeReq = makeFakeReq();
      const fakeRes = makeFakeResponse(200, 'ok');
      if (typeof cb === 'function') {
        setTimeout(() => {
          (cb as (r: unknown) => void)(fakeRes);
          setTimeout(() => { fakeRes.emit('data', Buffer.from('ok')); fakeRes.emit('end'); }, 5);
        }, 0);
      }
      return fakeReq;
    };
    mockHttpFn.mockImplementation(impl);
    mockHttpsFn.mockImplementation(impl);

    const steps: TransactionStep[] = [{ id: '1', name: 'Test', method: 'GET', url: 'https://api.example.com/resource/{{resourceId}}' }];
    await runTransactionCheck(steps, { resourceId: '42' });
    expect(capturedPath).toContain('/resource/42');
  });
});

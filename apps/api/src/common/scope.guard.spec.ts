import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { checkScopeAllows, ScopeGuard } from './scope.guard';
import { ApiKeyScope } from '../apikeys/apikeys.dto';

describe('checkScopeAllows (scope.guard helper)', () => {
  describe('HTTP method enforcement', () => {
    it('READ scope allows GET requests', () => {
      expect(checkScopeAllows(ApiKeyScope.READ, 'GET')).toBe(true);
    });

    it('READ scope denies DELETE requests', () => {
      expect(checkScopeAllows(ApiKeyScope.READ, 'DELETE')).toBe(false);
    });

    it('READ scope denies POST requests', () => {
      expect(checkScopeAllows(ApiKeyScope.READ, 'POST')).toBe(false);
    });

    it('WRITE scope allows POST requests', () => {
      expect(checkScopeAllows(ApiKeyScope.WRITE, 'POST')).toBe(true);
    });

    it('WRITE scope allows PATCH requests', () => {
      expect(checkScopeAllows(ApiKeyScope.WRITE, 'PATCH')).toBe(true);
    });

    it('WRITE scope denies DELETE requests', () => {
      expect(checkScopeAllows(ApiKeyScope.WRITE, 'DELETE')).toBe(false);
    });

    it('ADMIN scope allows DELETE requests', () => {
      expect(checkScopeAllows(ApiKeyScope.ADMIN, 'DELETE')).toBe(true);
    });
  });

  describe('Decorator-declared @RequireScope enforcement', () => {
    it('READ key satisfies READ requirement on GET', () => {
      expect(checkScopeAllows(ApiKeyScope.READ, 'GET', ApiKeyScope.READ)).toBe(true);
    });

    it('READ key fails WRITE requirement even on GET', () => {
      expect(checkScopeAllows(ApiKeyScope.READ, 'GET', ApiKeyScope.WRITE)).toBe(false);
    });

    it('WRITE key satisfies READ requirement on GET', () => {
      expect(checkScopeAllows(ApiKeyScope.WRITE, 'GET', ApiKeyScope.READ)).toBe(true);
    });

    it('WRITE key satisfies WRITE requirement on POST', () => {
      expect(checkScopeAllows(ApiKeyScope.WRITE, 'POST', ApiKeyScope.WRITE)).toBe(true);
    });

    it('WRITE key fails ADMIN requirement on POST', () => {
      expect(checkScopeAllows(ApiKeyScope.WRITE, 'POST', ApiKeyScope.ADMIN)).toBe(false);
    });

    it('ADMIN key satisfies ADMIN requirement on DELETE', () => {
      expect(checkScopeAllows(ApiKeyScope.ADMIN, 'DELETE', ApiKeyScope.ADMIN)).toBe(true);
    });

    it('ADMIN key satisfies READ requirement on GET', () => {
      expect(checkScopeAllows(ApiKeyScope.ADMIN, 'GET', ApiKeyScope.READ)).toBe(true);
    });
  });

  describe('Case insensitivity', () => {
    it('handles lowercase method strings', () => {
      expect(checkScopeAllows(ApiKeyScope.WRITE, 'post', ApiKeyScope.WRITE)).toBe(true);
    });
  });
});

describe('ScopeGuard (canActivate)', () => {
  let guard: ScopeGuard;
  let reflector: Reflector;

  function mockContext(
    method: string,
    user?: { id: string; email: string; role: string; apiKeyScope?: ApiKeyScope },
  ) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ method, user }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as import('@nestjs/common').ExecutionContext;
  }

  beforeEach(() => {
    reflector = new Reflector();
    guard = new ScopeGuard(reflector);
  });

  it('allows session-authenticated users (no apiKeyScope) unconditionally', () => {
    const ctx = mockContext('DELETE', { id: '1', email: 'a@b.com', role: 'admin' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows unauthenticated requests (no user) unconditionally', () => {
    const ctx = mockContext('GET');
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows READ key on GET request', () => {
    const ctx = mockContext('GET', { id: '1', email: 'a@b.com', role: 'user', apiKeyScope: ApiKeyScope.READ });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('denies READ key on POST request', () => {
    const ctx = mockContext('POST', { id: '1', email: 'a@b.com', role: 'user', apiKeyScope: ApiKeyScope.READ });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('denies READ key on DELETE request', () => {
    const ctx = mockContext('DELETE', { id: '1', email: 'a@b.com', role: 'user', apiKeyScope: ApiKeyScope.READ });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('allows WRITE key on PATCH request', () => {
    const ctx = mockContext('PATCH', { id: '1', email: 'a@b.com', role: 'user', apiKeyScope: ApiKeyScope.WRITE });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('denies WRITE key on DELETE request', () => {
    const ctx = mockContext('DELETE', { id: '1', email: 'a@b.com', role: 'user', apiKeyScope: ApiKeyScope.WRITE });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('allows ADMIN key on DELETE request', () => {
    const ctx = mockContext('DELETE', { id: '1', email: 'a@b.com', role: 'user', apiKeyScope: ApiKeyScope.ADMIN });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows READ key on HEAD request', () => {
    const ctx = mockContext('HEAD', { id: '1', email: 'a@b.com', role: 'user', apiKeyScope: ApiKeyScope.READ });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows READ key on OPTIONS request', () => {
    const ctx = mockContext('OPTIONS', { id: '1', email: 'a@b.com', role: 'user', apiKeyScope: ApiKeyScope.READ });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('denies when decorator requires higher scope than key', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(ApiKeyScope.ADMIN);
    const ctx = mockContext('GET', { id: '1', email: 'a@b.com', role: 'user', apiKeyScope: ApiKeyScope.READ });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('allows when decorator requires same scope as key', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(ApiKeyScope.WRITE);
    const ctx = mockContext('POST', { id: '1', email: 'a@b.com', role: 'user', apiKeyScope: ApiKeyScope.WRITE });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows when decorator requires lower scope than key', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(ApiKeyScope.READ);
    const ctx = mockContext('GET', { id: '1', email: 'a@b.com', role: 'user', apiKeyScope: ApiKeyScope.ADMIN });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('passes when no @RequireScope decorator present', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const ctx = mockContext('GET', { id: '1', email: 'a@b.com', role: 'user', apiKeyScope: ApiKeyScope.READ });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('handles lowercase method from request', () => {
    const ctx = mockContext('get', { id: '1', email: 'a@b.com', role: 'user', apiKeyScope: ApiKeyScope.READ });
    expect(guard.canActivate(ctx)).toBe(true);
  });
});

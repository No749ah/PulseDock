import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

function makeContext(userRole?: 'admin' | 'user' | null): ExecutionContext {
  const request = userRole !== undefined && userRole !== null ? { user: { role: userRole } } : { user: undefined };
  return {
    getHandler: vi.fn().mockReturnValue({}),
    getClass: vi.fn().mockReturnValue({}),
    switchToHttp: vi.fn().mockReturnValue({
      getRequest: vi.fn().mockReturnValue(request),
    }),
  } as unknown as ExecutionContext;
}

function makeReflector(roles: Array<'admin' | 'user'> | null) {
  return { getAllAndOverride: vi.fn().mockReturnValue(roles) } as unknown as Reflector;
}

describe('RolesGuard', () => {
  let guard: RolesGuard;

  describe('when no roles metadata is set', () => {
    beforeEach(() => {
      guard = new RolesGuard(makeReflector(null));
    });

    it('returns true (no restriction)', () => {
      const ctx = makeContext('user');
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('returns true even when user is undefined', () => {
      const ctx = makeContext(undefined);
      expect(guard.canActivate(ctx)).toBe(true);
    });
  });

  describe('when roles metadata is an empty array', () => {
    beforeEach(() => {
      guard = new RolesGuard(makeReflector([]));
    });

    it('returns true (empty roles = no restriction)', () => {
      const ctx = makeContext('user');
      expect(guard.canActivate(ctx)).toBe(true);
    });
  });

  describe('when roles are restricted to ["admin"]', () => {
    beforeEach(() => {
      guard = new RolesGuard(makeReflector(['admin']));
    });

    it('returns true when user has admin role', () => {
      const ctx = makeContext('admin');
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('throws ForbiddenException when user has "user" role', () => {
      const ctx = makeContext('user');
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when user is not authenticated', () => {
      const ctx = makeContext(undefined);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  describe('when roles include both ["admin", "user"]', () => {
    beforeEach(() => {
      guard = new RolesGuard(makeReflector(['admin', 'user']));
    });

    it('returns true for admin', () => {
      expect(guard.canActivate(makeContext('admin'))).toBe(true);
    });

    it('returns true for user', () => {
      expect(guard.canActivate(makeContext('user'))).toBe(true);
    });
  });
});

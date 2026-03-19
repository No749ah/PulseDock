import { describe, it, expect } from 'vitest';
import { checkScopeAllows } from './scope.guard';
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

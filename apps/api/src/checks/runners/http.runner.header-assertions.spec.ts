/**
 * Unit tests for evaluateHeaderAssertions() — pure function, no HTTP mocking needed.
 */

import { describe, it, expect } from 'vitest';
import { evaluateHeaderAssertions } from './http.runner';

describe('evaluateHeaderAssertions', () => {
  it('should pass (no failure) when "exists" assertion and header is present', () => {
    const headers = { 'x-frame-options': 'DENY' };
    const assertions = [{ header: 'x-frame-options', op: 'exists' }];

    const failures = evaluateHeaderAssertions(headers, assertions);

    expect(failures).toHaveLength(0);
  });

  it('should fail when "exists" assertion and header is missing', () => {
    const headers = { 'content-type': 'application/json' };
    const assertions = [{ header: 'strict-transport-security', op: 'exists' }];

    const failures = evaluateHeaderAssertions(headers, assertions);

    expect(failures).toHaveLength(1);
    expect(failures[0].header).toBe('strict-transport-security');
    expect(failures[0].op).toBe('exists');
    expect(failures[0].actual).toBeNull();
    expect(failures[0].message).toContain('"strict-transport-security" missing');
  });

  it('should pass (no failure) when "equals" assertion and header matches exactly', () => {
    const headers = { 'x-content-type-options': 'nosniff' };
    const assertions = [{ header: 'x-content-type-options', op: 'equals', value: 'nosniff' }];

    const failures = evaluateHeaderAssertions(headers, assertions);

    expect(failures).toHaveLength(0);
  });

  it('should fail when "equals" assertion and header has different value', () => {
    const headers = { 'x-content-type-options': 'sniff' };
    const assertions = [{ header: 'x-content-type-options', op: 'equals', value: 'nosniff' }];

    const failures = evaluateHeaderAssertions(headers, assertions);

    expect(failures).toHaveLength(1);
    expect(failures[0].header).toBe('x-content-type-options');
    expect(failures[0].expected).toBe('nosniff');
    expect(failures[0].actual).toBe('sniff');
    expect(failures[0].message).toContain('expected "nosniff"');
  });

  it('should pass (no failure) when "contains" assertion and header value includes substring', () => {
    const headers = { 'content-type': 'application/json; charset=utf-8' };
    const assertions = [{ header: 'content-type', op: 'contains', value: 'application/json' }];

    const failures = evaluateHeaderAssertions(headers, assertions);

    expect(failures).toHaveLength(0);
  });
});

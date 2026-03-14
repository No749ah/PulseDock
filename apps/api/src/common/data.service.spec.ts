import { describe, it, expect } from 'vitest';
import { DataService } from './data.service';

describe('DataService', () => {
  it('initialises with empty arrays', () => {
    const svc = new DataService();
    expect(svc.users).toHaveLength(0);
    expect(svc.sessions).toHaveLength(0);
    expect(svc.folders).toHaveLength(0);
    expect(svc.monitors).toHaveLength(0);
    expect(svc.runs).toHaveLength(0);
    expect(svc.alertChannels).toHaveLength(0);
  });

  it('id() returns a UUID string', () => {
    const svc = new DataService();
    const id = svc.id();
    expect(typeof id).toBe('string');
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('id() returns unique values', () => {
    const svc = new DataService();
    const ids = new Set(Array.from({ length: 50 }, () => svc.id()));
    expect(ids.size).toBe(50);
  });

  it('hash() returns a consistent sha256 hex string', () => {
    const svc = new DataService();
    const h1 = svc.hash('test-value');
    const h2 = svc.hash('test-value');
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hash() produces different values for different inputs', () => {
    const svc = new DataService();
    expect(svc.hash('a')).not.toBe(svc.hash('b'));
  });
});

/**
 * Unit tests for BasicSettingsSection pure logic.
 * Tests monitor type options, form validation, tag toggling, target validation.
 */
import { describe, it, expect } from 'vitest';

// ── Constants mirrored from component ────────────────────────────────────────

const MONITOR_TYPES = [
  'HTTP', 'TCP', 'SSL_CERT', 'HEARTBEAT', 'DNS', 'PING',
  'SMTP', 'FTP', 'IMAP', 'POP3', 'BROWSER', 'WHOIS',
  'CT_LOG', 'GRAPHQL', 'TRANSACTION',
] as const;

type MonitorType = (typeof MONITOR_TYPES)[number];

// ── Logic mirrored from component ────────────────────────────────────────────

function validateName(name: string): string {
  if (!name.trim()) return 'Name is required';
  if (name.trim().length < 2) return 'Name must be at least 2 characters';
  return '';
}

function validateTarget(target: string, type: MonitorType): string {
  if (!target.trim()) return 'Target is required';
  if (type === 'HTTP') {
    try { new URL(target); return ''; } catch { return 'Must be a valid URL'; }
  }
  if (type === 'TCP' || type === 'SMTP') {
    if (!/^[^:\s]+:\d+$/.test(target)) return 'Must be host:port';
  }
  return '';
}

function toggleTag(selected: string[], tag: string): string[] {
  return selected.includes(tag)
    ? selected.filter((t) => t !== tag)
    : [...selected, tag];
}

function addTagFromInput(selected: string[], input: string): { tags: string[]; cleared: boolean } {
  const newTag = input.trim().replace(/,+$/, '').trim();
  if (!newTag || selected.includes(newTag)) return { tags: selected, cleared: false };
  return { tags: [...selected, newTag], cleared: true };
}

function buildDefaultFormData(type: MonitorType) {
  return {
    type,
    pluginId: '',
    name: '',
    target: '',
    heartbeatTimeoutMin: type === 'HEARTBEAT' ? 5 : undefined,
    heartbeatToken: type === 'HEARTBEAT' ? 'test-token' : undefined,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BasicSettingsSection — MONITOR_TYPES', () => {
  it('contains 15 monitor types', () => {
    expect(MONITOR_TYPES).toHaveLength(15);
  });

  it('includes expected type keys', () => {
    const types = [...MONITOR_TYPES];
    expect(types).toContain('HTTP');
    expect(types).toContain('TCP');
    expect(types).toContain('SSL_CERT');
    expect(types).toContain('HEARTBEAT');
    expect(types).toContain('DNS');
    expect(types).toContain('GRAPHQL');
    expect(types).toContain('TRANSACTION');
    expect(types).toContain('BROWSER');
  });

  it('every type is a non-empty string', () => {
    MONITOR_TYPES.forEach((t) => expect(t.length).toBeGreaterThan(0));
  });
});

describe('BasicSettingsSection — validateName', () => {
  it('rejects empty name', () => {
    expect(validateName('')).toBe('Name is required');
  });

  it('rejects whitespace-only name', () => {
    expect(validateName('   ')).toBe('Name is required');
  });

  it('rejects single-character name', () => {
    expect(validateName('A')).toBe('Name must be at least 2 characters');
  });

  it('accepts name with exactly 2 characters', () => {
    expect(validateName('AB')).toBe('');
  });

  it('accepts normal name', () => {
    expect(validateName('My API Monitor')).toBe('');
  });

  it('name with leading/trailing spaces that trims to >= 2 chars is valid', () => {
    expect(validateName('  Hi  ')).toBe('');
  });
});

describe('BasicSettingsSection — validateTarget (HTTP)', () => {
  it('rejects empty target', () => {
    expect(validateTarget('', 'HTTP')).toBe('Target is required');
  });

  it('rejects non-URL for HTTP type', () => {
    expect(validateTarget('not-a-url', 'HTTP')).toBe('Must be a valid URL');
  });

  it('rejects bare hostname for HTTP type', () => {
    expect(validateTarget('example.com', 'HTTP')).toBe('Must be a valid URL');
  });

  it('accepts https URL for HTTP type', () => {
    expect(validateTarget('https://example.com', 'HTTP')).toBe('');
  });

  it('accepts http URL with path and query', () => {
    expect(validateTarget('http://api.example.com/health?foo=bar', 'HTTP')).toBe('');
  });
});

describe('BasicSettingsSection — validateTarget (TCP)', () => {
  it('rejects empty target for TCP', () => {
    expect(validateTarget('', 'TCP')).toBe('Target is required');
  });

  it('rejects hostname without port for TCP', () => {
    expect(validateTarget('example.com', 'TCP')).toBe('Must be host:port');
  });

  it('accepts host:port for TCP', () => {
    expect(validateTarget('example.com:5432', 'TCP')).toBe('');
  });

  it('accepts IP:port for TCP', () => {
    expect(validateTarget('192.168.1.1:80', 'TCP')).toBe('');
  });
});

describe('BasicSettingsSection — validateTarget (SMTP)', () => {
  it('rejects hostname without port for SMTP', () => {
    expect(validateTarget('mail.example.com', 'SMTP')).toBe('Must be host:port');
  });

  it('accepts host:port for SMTP', () => {
    expect(validateTarget('mail.example.com:25', 'SMTP')).toBe('');
  });
});

describe('BasicSettingsSection — validateTarget (other types)', () => {
  const otherTypes: MonitorType[] = ['SSL_CERT', 'DNS', 'PING', 'HEARTBEAT', 'BROWSER', 'WHOIS'];

  otherTypes.forEach((type) => {
    it(`accepts any non-empty target for ${type}`, () => {
      expect(validateTarget('example.com', type)).toBe('');
    });

    it(`rejects empty target for ${type}`, () => {
      expect(validateTarget('', type)).toBe('Target is required');
    });
  });
});

describe('BasicSettingsSection — toggleTag', () => {
  it('adds a tag when not present', () => {
    const result = toggleTag([], 'production');
    expect(result).toEqual(['production']);
  });

  it('removes a tag when already present', () => {
    const result = toggleTag(['production', 'api'], 'production');
    expect(result).toEqual(['api']);
  });

  it('removes tag when toggling an existing tag (no duplication)', () => {
    const result = toggleTag(['api'], 'api');
    expect(result).toHaveLength(0);
    expect(result).not.toContain('api');
  });

  it('preserves other tags when removing one', () => {
    const result = toggleTag(['a', 'b', 'c'], 'b');
    expect(result).toEqual(['a', 'c']);
  });

  it('returns new array reference', () => {
    const original = ['a'];
    const result = toggleTag(original, 'b');
    expect(result).not.toBe(original);
  });
});

describe('BasicSettingsSection — addTagFromInput', () => {
  it('adds a new tag from input', () => {
    const { tags, cleared } = addTagFromInput([], 'production');
    expect(tags).toEqual(['production']);
    expect(cleared).toBe(true);
  });

  it('trims whitespace and trailing commas', () => {
    const { tags } = addTagFromInput([], ' api, ');
    expect(tags).toEqual(['api']);
  });

  it('does not add duplicate tag', () => {
    const { tags, cleared } = addTagFromInput(['api'], 'api');
    expect(tags).toEqual(['api']);
    expect(cleared).toBe(false);
  });

  it('does not add empty string', () => {
    const { tags, cleared } = addTagFromInput(['api'], '');
    expect(tags).toEqual(['api']);
    expect(cleared).toBe(false);
  });

  it('does not add whitespace-only string', () => {
    const { cleared } = addTagFromInput([], '   ');
    expect(cleared).toBe(false);
  });

  it('adds to existing tags list', () => {
    const { tags } = addTagFromInput(['a', 'b'], 'c');
    expect(tags).toEqual(['a', 'b', 'c']);
  });
});

describe('BasicSettingsSection — HEARTBEAT type defaults', () => {
  it('sets heartbeatTimeoutMin to 5 for HEARTBEAT type', () => {
    const fd = buildDefaultFormData('HEARTBEAT');
    expect(fd.heartbeatTimeoutMin).toBe(5);
  });

  it('sets heartbeatToken for HEARTBEAT type', () => {
    const fd = buildDefaultFormData('HEARTBEAT');
    expect(typeof fd.heartbeatToken).toBe('string');
    expect((fd.heartbeatToken ?? '').length).toBeGreaterThan(0);
  });

  it('does not set heartbeatTimeoutMin for non-HEARTBEAT types', () => {
    const fd = buildDefaultFormData('HTTP');
    expect(fd.heartbeatTimeoutMin).toBeUndefined();
  });

  it('does not set heartbeatToken for non-HEARTBEAT types', () => {
    const fd = buildDefaultFormData('HTTP');
    expect(fd.heartbeatToken).toBeUndefined();
  });
});

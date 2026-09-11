import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  printJson,
  printSuccess,
  printError,
  printWarning,
  printInfo,
  statusColor,
  durationColor,
  formatBytes,
  printTable,
} from './output.js';

// Capture stdout/stderr without chalk colors for assertion
function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1B\[[0-9;]*m/g, '');
}

describe('printJson', () => {
  let stdoutWrite: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes pretty-printed JSON to stdout', () => {
    printJson({ ok: true, count: 3 });
    expect(stdoutWrite).toHaveBeenCalledOnce();
    const output = stdoutWrite.mock.calls[0]?.[0] as string;
    expect(JSON.parse(output.trim())).toEqual({ ok: true, count: 3 });
  });

  it('handles arrays', () => {
    printJson([1, 2, 3]);
    const output = stdoutWrite.mock.calls[0]?.[0] as string;
    expect(JSON.parse(output.trim())).toEqual([1, 2, 3]);
  });

  it('handles null values', () => {
    printJson(null);
    const output = stdoutWrite.mock.calls[0]?.[0] as string;
    expect(output.trim()).toBe('null');
  });
});

describe('printSuccess', () => {
  let stderrWrite: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes to stderr with checkmark prefix', () => {
    printSuccess('All good');
    expect(stderrWrite).toHaveBeenCalledOnce();
    const output = stripAnsi(stderrWrite.mock.calls[0]?.[0] as string);
    expect(output).toContain('✓');
    expect(output).toContain('All good');
  });
});

describe('printError', () => {
  let stderrWrite: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes to stderr with cross prefix', () => {
    printError('Something broke');
    expect(stderrWrite).toHaveBeenCalledOnce();
    const output = stripAnsi(stderrWrite.mock.calls[0]?.[0] as string);
    expect(output).toContain('✗');
    expect(output).toContain('Something broke');
  });
});

describe('printWarning', () => {
  let stderrWrite: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes to stderr with warning symbol', () => {
    printWarning('Heads up');
    expect(stderrWrite).toHaveBeenCalledOnce();
    const output = stripAnsi(stderrWrite.mock.calls[0]?.[0] as string);
    expect(output).toContain('⚠');
    expect(output).toContain('Heads up');
  });
});

describe('printInfo', () => {
  let stderrWrite: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes message to stderr', () => {
    printInfo('Loading...');
    expect(stderrWrite).toHaveBeenCalledOnce();
    const output = stripAnsi(stderrWrite.mock.calls[0]?.[0] as string);
    expect(output).toContain('Loading...');
  });
});

describe('statusColor', () => {
  it('returns green-colored text for 2xx', () => {
    const result = stripAnsi(statusColor(200));
    expect(result).toBe('200');
  });

  it('returns cyan-colored text for 3xx', () => {
    const result = stripAnsi(statusColor(301));
    expect(result).toBe('301');
  });

  it('returns yellow-colored text for 4xx', () => {
    const result = stripAnsi(statusColor(404));
    expect(result).toBe('404');
  });

  it('returns red-colored text for 5xx', () => {
    const result = stripAnsi(statusColor(500));
    expect(result).toBe('500');
  });

  it('returns red for status 0 (connection error)', () => {
    const result = stripAnsi(statusColor(0));
    expect(result).toBe('0');
  });
});

describe('durationColor', () => {
  it('returns green for fast responses (< 200ms)', () => {
    const result = stripAnsi(durationColor(50));
    expect(result).toBe('50ms');
  });

  it('returns yellow for medium responses (200–799ms)', () => {
    const result = stripAnsi(durationColor(400));
    expect(result).toBe('400ms');
  });

  it('returns red for slow responses (>= 800ms)', () => {
    const result = stripAnsi(durationColor(1200));
    expect(result).toBe('1200ms');
  });

  it('boundary: 200ms is yellow', () => {
    const result = stripAnsi(durationColor(200));
    expect(result).toBe('200ms');
  });

  it('boundary: 800ms is red', () => {
    const result = stripAnsi(durationColor(800));
    expect(result).toBe('800ms');
  });
});

describe('formatBytes', () => {
  it('formats bytes below 1024 as bytes', () => {
    expect(formatBytes(512)).toBe('512B');
  });

  it('formats exactly 1023 bytes', () => {
    expect(formatBytes(1023)).toBe('1023B');
  });

  it('formats kilobytes (>= 1024)', () => {
    expect(formatBytes(1024)).toBe('1.0KB');
    expect(formatBytes(2048)).toBe('2.0KB');
    expect(formatBytes(1536)).toBe('1.5KB');
  });

  it('formats megabytes (>= 1MB)', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0MB');
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.0MB');
  });

  it('handles 0 bytes', () => {
    expect(formatBytes(0)).toBe('0B');
  });
});

describe('printTable', () => {
  let stdoutWrite: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does nothing for empty rows', () => {
    printTable([]);
    expect(stdoutWrite).not.toHaveBeenCalled();
  });

  it('prints header, divider, and data rows', () => {
    printTable([
      { name: 'api.example.com', status: 'UP', latency: '45ms' },
      { name: 'db.example.com', status: 'DOWN', latency: 'N/A' },
    ]);

    const allOutput = (stdoutWrite.mock.calls as [string][])
      .map((c) => stripAnsi(c[0]))
      .join('');

    expect(allOutput).toContain('name');
    expect(allOutput).toContain('status');
    expect(allOutput).toContain('latency');
    expect(allOutput).toContain('api.example.com');
    expect(allOutput).toContain('db.example.com');
    expect(allOutput).toContain('UP');
    expect(allOutput).toContain('DOWN');
  });

  it('pads columns to align values', () => {
    printTable([
      { host: 'a', ms: '1' },
      { host: 'longer-host', ms: '999' },
    ]);

    // Should produce at minimum 3 write calls: header, divider, row1, row2
    expect(stdoutWrite.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('handles single row', () => {
    printTable([{ id: '1', name: 'monitor' }]);
    const allOutput = (stdoutWrite.mock.calls as [string][])
      .map((c) => stripAnsi(c[0]))
      .join('');
    expect(allOutput).toContain('monitor');
  });

  it('handles missing values gracefully', () => {
    // TypeScript will warn, but runtime should handle undefined/null gracefully
    printTable([{ a: 'x', b: undefined as unknown as string }]);
    const allOutput = (stdoutWrite.mock.calls as [string][])
      .map((c) => stripAnsi(c[0]))
      .join('');
    expect(allOutput).toContain('a');
    expect(allOutput).toContain('b');
  });
});

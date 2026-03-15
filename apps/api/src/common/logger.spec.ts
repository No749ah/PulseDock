import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger, createLogger } from './logger';

// ── helpers ──────────────────────────────────────────────────────────────────

function captureStdout(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    lines.push(String(chunk));
    return true;
  });
  return {
    lines,
    restore: () => spy.mockRestore(),
  };
}

function parseLastLine(lines: string[]): Record<string, unknown> {
  const last = lines[lines.length - 1]?.trim();
  if (!last) throw new Error('no output captured');
  return JSON.parse(last) as Record<string, unknown>;
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('Logger', () => {
  afterEach(() => {
    delete process.env['LOG_LEVEL'];
  });

  // ── constructor + context ─────────────────────────────────────────────────

  describe('constructor', () => {
    it('creates a logger with no context', () => {
      const logger = new Logger();
      expect(logger).toBeInstanceOf(Logger);
    });

    it('creates a logger with context', () => {
      const logger = new Logger({ service: 'test-svc', userId: 'u-1' });
      expect(logger).toBeInstanceOf(Logger);
    });

    it('respects LOG_LEVEL env — debug level emits all messages', () => {
      process.env['LOG_LEVEL'] = 'debug';
      const logger = new Logger();
      const cap = captureStdout();
      logger.debug('test debug');
      cap.restore();
      expect(cap.lines.length).toBeGreaterThan(0);
    });

    it('respects LOG_LEVEL env — error level suppresses debug/info/warn', () => {
      process.env['LOG_LEVEL'] = 'error';
      const logger = new Logger();
      const cap = captureStdout();
      logger.debug('should be suppressed');
      logger.info('should be suppressed');
      logger.warn('should be suppressed');
      cap.restore();
      expect(cap.lines).toHaveLength(0);
    });

    it('falls back to info when LOG_LEVEL is invalid', () => {
      process.env['LOG_LEVEL'] = 'INVALID_LEVEL';
      const logger = new Logger();
      const cap = captureStdout();
      // info should be emitted at default 'info' level
      logger.info('info visible');
      // debug should be suppressed
      logger.debug('debug suppressed');
      cap.restore();
      expect(cap.lines).toHaveLength(1);
      const parsed = parseLastLine(cap.lines);
      expect(parsed.level).toBe('info');
    });
  });

  // ── info() ────────────────────────────────────────────────────────────────

  describe('info()', () => {
    it('writes a JSON log entry to stdout', () => {
      const logger = new Logger({ service: 'api' });
      const cap = captureStdout();
      logger.info('hello world');
      cap.restore();

      expect(cap.lines).toHaveLength(1);
      const entry = parseLastLine(cap.lines);
      expect(entry.level).toBe('info');
      expect(entry.message).toBe('hello world');
      expect(entry.service).toBe('api');
      expect(typeof entry.timestamp).toBe('string');
    });

    it('merges extra fields into the log entry', () => {
      const logger = new Logger();
      const cap = captureStdout();
      logger.info('with extra', { requestId: 'req-42', statusCode: 200 });
      cap.restore();

      const entry = parseLastLine(cap.lines);
      expect(entry.requestId).toBe('req-42');
      expect(entry.statusCode).toBe(200);
    });

    it('includes context fields from constructor', () => {
      const logger = new Logger({ userId: 'u-999', action: 'create' });
      const cap = captureStdout();
      logger.info('ctx test');
      cap.restore();

      const entry = parseLastLine(cap.lines);
      expect(entry.userId).toBe('u-999');
      expect(entry.action).toBe('create');
    });
  });

  // ── warn() ────────────────────────────────────────────────────────────────

  describe('warn()', () => {
    it('emits a warn-level entry', () => {
      const logger = new Logger();
      const cap = captureStdout();
      logger.warn('something might be wrong');
      cap.restore();

      const entry = parseLastLine(cap.lines);
      expect(entry.level).toBe('warn');
      expect(entry.message).toBe('something might be wrong');
    });
  });

  // ── debug() ───────────────────────────────────────────────────────────────

  describe('debug()', () => {
    it('is suppressed at default log level (info)', () => {
      process.env['LOG_LEVEL'] = 'info';
      const logger = new Logger();
      const cap = captureStdout();
      logger.debug('should not appear');
      cap.restore();
      expect(cap.lines).toHaveLength(0);
    });

    it('is emitted when LOG_LEVEL=debug', () => {
      process.env['LOG_LEVEL'] = 'debug';
      const logger = new Logger();
      const cap = captureStdout();
      logger.debug('debug message');
      cap.restore();

      expect(cap.lines).toHaveLength(1);
      const entry = parseLastLine(cap.lines);
      expect(entry.level).toBe('debug');
    });

    it('includes extra fields at debug level', () => {
      process.env['LOG_LEVEL'] = 'debug';
      const logger = new Logger();
      const cap = captureStdout();
      logger.debug('debug with extras', { traceId: 'abc' });
      cap.restore();

      const entry = parseLastLine(cap.lines);
      expect(entry.traceId).toBe('abc');
    });
  });

  // ── error() ───────────────────────────────────────────────────────────────

  describe('error()', () => {
    it('includes error.message and stack when given an Error', () => {
      const logger = new Logger();
      const cap = captureStdout();
      const err = new Error('boom');
      logger.error('something failed', err);
      cap.restore();

      const entry = parseLastLine(cap.lines);
      expect(entry.level).toBe('error');
      expect(entry.error).toBe('boom');
      expect(typeof entry.stack).toBe('string');
    });

    it('stringifies non-Error values in error field', () => {
      const logger = new Logger();
      const cap = captureStdout();
      logger.error('failed', 'string error reason');
      cap.restore();

      const entry = parseLastLine(cap.lines);
      expect(entry.error).toBe('string error reason');
    });

    it('handles numeric error values', () => {
      const logger = new Logger();
      const cap = captureStdout();
      logger.error('failed', 42);
      cap.restore();

      const entry = parseLastLine(cap.lines);
      expect(entry.error).toBe('42');
    });

    it('merges extra fields when error + extra provided', () => {
      const logger = new Logger();
      const cap = captureStdout();
      logger.error('ctx error', new Error('bad'), { userId: 'u-1' });
      cap.restore();

      const entry = parseLastLine(cap.lines);
      expect(entry.userId).toBe('u-1');
      expect(entry.error).toBe('bad');
    });

    it('is always emitted regardless of log level', () => {
      process.env['LOG_LEVEL'] = 'error';
      const logger = new Logger();
      const cap = captureStdout();
      logger.error('critical', new Error('fatal'));
      cap.restore();
      expect(cap.lines).toHaveLength(1);
    });
  });

  // ── child() ───────────────────────────────────────────────────────────────

  describe('child()', () => {
    it('returns a new Logger instance', () => {
      const parent = new Logger({ service: 'parent' });
      const child = parent.child({ requestId: 'req-1' });
      expect(child).toBeInstanceOf(Logger);
    });

    it('child inherits parent context and adds its own', () => {
      const parent = new Logger({ service: 'svc', userId: 'u-1' });
      const child = parent.child({ action: 'child-action' });
      const cap = captureStdout();
      child.info('child log');
      cap.restore();

      const entry = parseLastLine(cap.lines);
      expect(entry.service).toBe('svc');
      expect(entry.userId).toBe('u-1');
      expect(entry.action).toBe('child-action');
    });

    it('child context overrides parent context', () => {
      const parent = new Logger({ service: 'parent-svc' });
      const child = parent.child({ service: 'child-svc' });
      const cap = captureStdout();
      child.info('override test');
      cap.restore();

      const entry = parseLastLine(cap.lines);
      expect(entry.service).toBe('child-svc');
    });
  });

  // ── timestamp ─────────────────────────────────────────────────────────────

  describe('timestamp', () => {
    it('includes a valid ISO 8601 timestamp in every entry', () => {
      const logger = new Logger();
      const cap = captureStdout();
      logger.info('time check');
      cap.restore();

      const entry = parseLastLine(cap.lines);
      const ts = new Date(entry.timestamp as string);
      expect(ts.getTime()).not.toBeNaN();
    });
  });

  // ── log level order ───────────────────────────────────────────────────────

  describe('log level ordering', () => {
    it('warn level suppresses debug and info', () => {
      process.env['LOG_LEVEL'] = 'warn';
      const logger = new Logger();
      const cap = captureStdout();
      logger.debug('nope');
      logger.info('nope');
      logger.warn('yes');
      logger.error('yes');
      cap.restore();
      expect(cap.lines).toHaveLength(2);
    });

    it('info level emits info, warn, error but not debug', () => {
      process.env['LOG_LEVEL'] = 'info';
      const logger = new Logger();
      const cap = captureStdout();
      logger.debug('no');
      logger.info('yes');
      logger.warn('yes');
      logger.error('yes', new Error('e'));
      cap.restore();
      expect(cap.lines).toHaveLength(3);
    });
  });
});

// ── createLogger() ────────────────────────────────────────────────────────────

describe('createLogger()', () => {
  it('returns a Logger instance', () => {
    const logger = createLogger();
    expect(logger).toBeInstanceOf(Logger);
  });

  it('accepts context parameter', () => {
    const logger = createLogger({ service: 'test', userId: 'u-1' });
    const cap = captureStdout();
    logger.info('context test');
    cap.restore();

    const lines = cap.lines;
    const entry = JSON.parse(lines[lines.length - 1]?.trim() ?? '{}') as Record<string, unknown>;
    expect(entry.service).toBe('test');
    expect(entry.userId).toBe('u-1');
  });

  it('works without context parameter', () => {
    const logger = createLogger();
    const cap = captureStdout();
    logger.info('no ctx');
    cap.restore();
    expect(cap.lines).toHaveLength(1);
  });
});

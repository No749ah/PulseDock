import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Import logger after stubbing process streams
describe('logger', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logger.info writes to stdout as JSON with level=info', async () => {
    const { logger } = await import('./logger');
    logger.info('test message');

    expect(stdoutSpy).toHaveBeenCalledOnce();
    const written = String((stdoutSpy.mock.calls[0] as string[])[0]);
    const parsed = JSON.parse(written.trim());
    expect(parsed.level).toBe('info');
    expect(parsed.message).toBe('test message');
    expect(typeof parsed.timestamp).toBe('string');
  });

  it('logger.warn writes to stdout as JSON with level=warn', async () => {
    const { logger } = await import('./logger');
    logger.warn('warn message');

    expect(stdoutSpy).toHaveBeenCalledOnce();
    const written = String((stdoutSpy.mock.calls[0] as string[])[0]);
    const parsed = JSON.parse(written.trim());
    expect(parsed.level).toBe('warn');
    expect(parsed.message).toBe('warn message');
  });

  it('logger.error writes to stderr as JSON with level=error', async () => {
    const { logger } = await import('./logger');
    logger.error('error message');

    expect(stderrSpy).toHaveBeenCalledOnce();
    const written = String((stderrSpy.mock.calls[0] as string[])[0]);
    const parsed = JSON.parse(written.trim());
    expect(parsed.level).toBe('error');
    expect(parsed.message).toBe('error message');
  });

  it('logger.info includes extra fields in output', async () => {
    const { logger } = await import('./logger');
    logger.info('with extra', { toolId: 'nginx', version: '1.24.0' });

    const written = String((stdoutSpy.mock.calls[0] as string[])[0]);
    const parsed = JSON.parse(written.trim());
    expect(parsed.toolId).toBe('nginx');
    expect(parsed.version).toBe('1.24.0');
  });

  it('output is newline-terminated valid JSON', async () => {
    const { logger } = await import('./logger');
    logger.info('newline check');

    const written = String((stdoutSpy.mock.calls[0] as string[])[0]);
    expect(written.endsWith('\n')).toBe(true);
    expect(() => JSON.parse(written.trim())).not.toThrow();
  });
});

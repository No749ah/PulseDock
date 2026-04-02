import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import * as httpModule from '../utils/http.js';
import * as configModule from '../utils/config.js';
import { registerAlertsCommand } from './alerts.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeProgram(): Command {
  const program = new Command();
  program.exitOverride(); // prevents process.exit during tests
  registerAlertsCommand(program);
  return program;
}

const MOCK_CONFIG = {
  apiUrl: 'https://api.example.com',
  apiKey: 'pdck_testapikey',
  defaultFormat: 'json' as const,
};

const MOCK_CHANNELS = [
  { id: 'ch-001', name: 'Slack Ops', type: 'SLACK', enabled: true, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'ch-002', name: 'PagerDuty', type: 'PAGERDUTY', enabled: false, createdAt: '2026-01-02T00:00:00Z' },
];

const MOCK_DELIVERIES = [
  {
    id: 'del-001',
    channelId: 'ch-001',
    status: 'sent',
    sentAt: '2026-04-01T10:00:00Z',
    monitor: { name: 'api.example.com' },
  },
  {
    id: 'del-002',
    channelId: 'ch-002',
    status: 'failed',
    sentAt: '2026-04-01T09:00:00Z',
    failureReason: 'HTTP 401',
    monitor: { name: 'db.example.com' },
  },
];

// ─── alerts channels ──────────────────────────────────────────────────────────

describe('alerts channels', () => {
  let apiRequest: ReturnType<typeof vi.spyOn>;
  let loadConfig: ReturnType<typeof vi.spyOn>;
  let stdoutWrite: ReturnType<typeof vi.spyOn>;
  let stderrWrite: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    apiRequest = vi.spyOn(httpModule, 'apiRequest').mockResolvedValue(MOCK_CHANNELS);
    loadConfig = vi.spyOn(configModule, 'loadConfig').mockReturnValue(MOCK_CONFIG);
    stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls the alert-channels API endpoint', async () => {
    const program = makeProgram();
    await program.parseAsync(['alerts', 'channels', '--json'], { from: 'user' });
    expect(apiRequest).toHaveBeenCalledWith(
      MOCK_CONFIG.apiUrl,
      MOCK_CONFIG.apiKey,
      expect.stringContaining('/v1/alert-channels'),
    );
  });

  it('outputs channel list as JSON', async () => {
    apiRequest.mockResolvedValue(MOCK_CHANNELS);
    const program = makeProgram();
    await program.parseAsync(['alerts', 'channels', '--json'], { from: 'user' });

    const out = (stdoutWrite.mock.calls as [string][]).map((c) => c[0]).join('');
    const parsed = JSON.parse(out.trim());
    expect(parsed).toHaveLength(2);
    expect(parsed[0].id).toBe('ch-001');
  });

  it('handles empty channel list gracefully', async () => {
    apiRequest.mockResolvedValue([]);
    const program = makeProgram();
    await program.parseAsync(['alerts', 'channels', '--json'], { from: 'user' });

    const out = (stdoutWrite.mock.calls as [string][]).map((c) => c[0]).join('');
    expect(JSON.parse(out.trim())).toEqual([]);
  });

  it('handles envelope response (channels key)', async () => {
    apiRequest.mockResolvedValue({ channels: MOCK_CHANNELS });
    const program = makeProgram();
    await program.parseAsync(['alerts', 'channels', '--json'], { from: 'user' });

    const out = (stdoutWrite.mock.calls as [string][]).map((c) => c[0]).join('');
    const parsed = JSON.parse(out.trim());
    expect(parsed).toHaveLength(2);
  });

  it('passes --type filter to query string', async () => {
    const program = makeProgram();
    await program.parseAsync(['alerts', 'channels', '--type', 'slack', '--json'], { from: 'user' });

    const [, , path] = apiRequest.mock.calls[0] as [string, string, string];
    expect(path).toContain('type=SLACK');
  });

  it('exits with error when no auth configured', async () => {
    loadConfig.mockReturnValue({ defaultFormat: 'json' });
    const program = makeProgram();

    await expect(
      program.parseAsync(['alerts', 'channels'], { from: 'user' }),
    ).rejects.toThrow();

    const errOut = (stderrWrite.mock.calls as [string][]).map((c) => c[0]).join('');
    expect(errOut).toContain('API URL');
  });

  it('exits on API error', async () => {
    apiRequest.mockRejectedValue(new Error('API error 403 Forbidden'));
    const program = makeProgram();

    await expect(
      program.parseAsync(['alerts', 'channels', '--json'], { from: 'user' }),
    ).rejects.toThrow();
  });
});

// ─── alerts deliveries ────────────────────────────────────────────────────────

describe('alerts deliveries', () => {
  let apiRequest: ReturnType<typeof vi.spyOn>;
  let stdoutWrite: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    apiRequest = vi.spyOn(httpModule, 'apiRequest').mockResolvedValue(MOCK_DELIVERIES);
    vi.spyOn(configModule, 'loadConfig').mockReturnValue(MOCK_CONFIG);
    stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls the deliveries endpoint', async () => {
    const program = makeProgram();
    await program.parseAsync(['alerts', 'deliveries', '--json'], { from: 'user' });

    expect(apiRequest).toHaveBeenCalledWith(
      MOCK_CONFIG.apiUrl,
      MOCK_CONFIG.apiKey,
      expect.stringContaining('/v1/alert-channels/deliveries'),
    );
  });

  it('outputs deliveries as JSON', async () => {
    const program = makeProgram();
    await program.parseAsync(['alerts', 'deliveries', '--json'], { from: 'user' });

    const out = (stdoutWrite.mock.calls as [string][]).map((c) => c[0]).join('');
    const parsed = JSON.parse(out.trim());
    expect(parsed).toHaveLength(2);
    expect(parsed[0].status).toBe('sent');
    expect(parsed[1].status).toBe('failed');
  });

  it('includes --limit in query string', async () => {
    const program = makeProgram();
    await program.parseAsync(['alerts', 'deliveries', '--limit', '5', '--json'], { from: 'user' });

    const [, , path] = apiRequest.mock.calls[0] as [string, string, string];
    expect(path).toContain('limit=5');
  });

  it('handles envelope response (data key)', async () => {
    apiRequest.mockResolvedValue({ data: MOCK_DELIVERIES });
    const program = makeProgram();
    await program.parseAsync(['alerts', 'deliveries', '--json'], { from: 'user' });

    const out = (stdoutWrite.mock.calls as [string][]).map((c) => c[0]).join('');
    const parsed = JSON.parse(out.trim());
    expect(parsed).toHaveLength(2);
  });

  it('handles empty deliveries list', async () => {
    apiRequest.mockResolvedValue([]);
    const program = makeProgram();
    await program.parseAsync(['alerts', 'deliveries', '--json'], { from: 'user' });

    const out = (stdoutWrite.mock.calls as [string][]).map((c) => c[0]).join('');
    expect(JSON.parse(out.trim())).toEqual([]);
  });
});

// ─── alerts test ──────────────────────────────────────────────────────────────

describe('alerts test', () => {
  let apiRequest: ReturnType<typeof vi.spyOn>;
  let stdoutWrite: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    apiRequest = vi.spyOn(httpModule, 'apiRequest').mockResolvedValue({ success: true });
    vi.spyOn(configModule, 'loadConfig').mockReturnValue(MOCK_CONFIG);
    stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs to the test endpoint with channelId', async () => {
    const program = makeProgram();
    await program.parseAsync(['alerts', 'test', 'ch-001', '--json'], { from: 'user' });

    expect(apiRequest).toHaveBeenCalledWith(
      MOCK_CONFIG.apiUrl,
      MOCK_CONFIG.apiKey,
      '/v1/alert-channels/test',
      expect.objectContaining({ method: 'POST', body: { channelId: 'ch-001' } }),
    );
  });

  it('outputs success result as JSON', async () => {
    const program = makeProgram();
    await program.parseAsync(['alerts', 'test', 'ch-001', '--json'], { from: 'user' });

    const out = (stdoutWrite.mock.calls as [string][]).map((c) => c[0]).join('');
    const parsed = JSON.parse(out.trim());
    expect(parsed.success).toBe(true);
  });

  it('calls process.exit(1) on failed test', async () => {
    apiRequest.mockResolvedValue({ success: false, message: 'Channel unreachable' });
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const program = makeProgram();

    await program.parseAsync(['alerts', 'test', 'ch-bad', '--json'], { from: 'user' });

    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
  });

  it('exits with error on API failure', async () => {
    apiRequest.mockRejectedValue(new Error('API error 404'));
    const program = makeProgram();

    await expect(
      program.parseAsync(['alerts', 'test', 'ch-001', '--json'], { from: 'user' }),
    ).rejects.toThrow();
  });
});

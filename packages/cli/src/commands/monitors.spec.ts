import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import * as httpModule from '../utils/http.js';
import * as configModule from '../utils/config.js';
import { registerMonitorsCommand } from './monitors.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerMonitorsCommand(program);
  return program;
}

const MOCK_CONFIG = {
  apiUrl: 'https://api.example.com',
  apiKey: 'pdck_testapikey',
  defaultFormat: 'json' as const,
};

const MOCK_MONITORS = [
  { id: 'mon-001-xxxx', name: 'API Server', target: 'https://api.example.com/health', type: 'HTTP', enabled: true, intervalSec: 60 },
  { id: 'mon-002-xxxx', name: 'DB Check', target: 'db.example.com:5432', type: 'TCP', enabled: false, intervalSec: 120 },
];

const MOCK_PAGINATED = {
  data: MOCK_MONITORS,
  meta: { total: 2, page: 1, limit: 20, pages: 1 },
};

const MOCK_CHECK_RESULT = {
  id: 'chk-001',
  status: 200,
  latencyMs: 42,
  ok: true,
  checkedAt: '2026-04-02T12:00:00Z',
  message: 'OK',
};

// ─── Spies ────────────────────────────────────────────────────────────────────

let loadConfigSpy: ReturnType<typeof vi.spyOn>;
let apiRequestSpy: ReturnType<typeof vi.spyOn>;
let stdoutSpy: ReturnType<typeof vi.spyOn>;
let stderrSpy: ReturnType<typeof vi.spyOn>;
let exitSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  loadConfigSpy = vi.spyOn(configModule, 'loadConfig').mockReturnValue(MOCK_CONFIG);
  apiRequestSpy = vi.spyOn(httpModule, 'apiRequest').mockResolvedValue(MOCK_PAGINATED);
  stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── monitors list ────────────────────────────────────────────────────────────

describe('monitors list — JSON output', () => {
  it('calls apiRequest with correct path', async () => {
    const program = makeProgram();
    await program.parseAsync(['node', 'pulsedock', 'monitors', 'list', '--json']);
    expect(apiRequestSpy).toHaveBeenCalledWith(
      MOCK_CONFIG.apiUrl,
      MOCK_CONFIG.apiKey,
      expect.stringContaining('/api/v2/monitors'),
    );
  });

  it('includes page and limit params', async () => {
    const program = makeProgram();
    await program.parseAsync(['node', 'pulsedock', 'monitors', 'list', '--json', '-l', '10', '-p', '2']);
    expect(apiRequestSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.stringContaining('page=2'),
    );
    expect(apiRequestSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.stringContaining('limit=10'),
    );
  });

  it('outputs JSON when --json flag set', async () => {
    const program = makeProgram();
    await program.parseAsync(['node', 'pulsedock', 'monitors', 'list', '--json']);
    const output = stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
    const parsed = JSON.parse(output);
    expect(parsed.data).toHaveLength(2);
    expect(parsed.meta.total).toBe(2);
  });

  it('uses config defaultFormat=json when no --json flag', async () => {
    const program = makeProgram();
    await program.parseAsync(['node', 'pulsedock', 'monitors', 'list']);
    const output = stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
    expect(output).toContain('"data"');
  });

  it('respects --api-url and --api-key overrides', async () => {
    loadConfigSpy.mockReturnValue({ apiUrl: undefined, apiKey: undefined, defaultFormat: 'json' });
    const program = makeProgram();
    await program.parseAsync([
      'node', 'pulsedock', 'monitors', 'list', '--json',
      '--api-url', 'https://custom.example.com',
      '--api-key', 'custom_key',
    ]);
    expect(apiRequestSpy).toHaveBeenCalledWith(
      'https://custom.example.com',
      'custom_key',
      expect.any(String),
    );
  });
});

describe('monitors list — pretty output', () => {
  beforeEach(() => {
    loadConfigSpy.mockReturnValue({ ...MOCK_CONFIG, defaultFormat: 'pretty' });
  });

  it('prints table-style output', async () => {
    const program = makeProgram();
    await program.parseAsync(['node', 'pulsedock', 'monitors', 'list']);
    const output = stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
    expect(output).toContain('API Server');
  });

  it('shows page info line', async () => {
    const program = makeProgram();
    await program.parseAsync(['node', 'pulsedock', 'monitors', 'list']);
    // printInfo writes to stderr
    const output = stderrSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
    expect(output).toContain('2 of 2 monitors');
  });

  it('shows "No monitors found" when data is empty', async () => {
    apiRequestSpy.mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 20, pages: 0 } });
    const program = makeProgram();
    await program.parseAsync(['node', 'pulsedock', 'monitors', 'list']);
    const output = stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
    expect(output).toContain('No monitors found');
  });

  it('truncates long targets', async () => {
    const longTarget = 'https://' + 'a'.repeat(50) + '.example.com/health';
    apiRequestSpy.mockResolvedValue({
      data: [{ id: 'mon-zzz-xxx', name: 'Long', target: longTarget, type: 'HTTP', enabled: true, intervalSec: 30 }],
      meta: { total: 1, page: 1, limit: 20, pages: 1 },
    });
    const program = makeProgram();
    await program.parseAsync(['node', 'pulsedock', 'monitors', 'list']);
    const output = stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
    // truncated target should appear with ellipsis
    expect(output).toContain('...');
  });
});

describe('monitors list — missing credentials', () => {
  it('exits with error when no API credentials', async () => {
    loadConfigSpy.mockReturnValue({ apiUrl: undefined, apiKey: undefined, defaultFormat: 'pretty' });
    const program = makeProgram();
    await program.parseAsync(['node', 'pulsedock', 'monitors', 'list']);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

// ─── monitors check ───────────────────────────────────────────────────────────

describe('monitors check — JSON output', () => {
  beforeEach(() => {
    apiRequestSpy.mockResolvedValue(MOCK_CHECK_RESULT);
  });

  it('calls POST /api/v1/monitors/:id/check', async () => {
    const program = makeProgram();
    await program.parseAsync(['node', 'pulsedock', 'monitors', 'check', 'mon-001', '--json']);
    expect(apiRequestSpy).toHaveBeenCalledWith(
      MOCK_CONFIG.apiUrl,
      MOCK_CONFIG.apiKey,
      '/api/v1/monitors/mon-001/check',
      { method: 'POST' },
    );
  });

  it('outputs JSON result', async () => {
    const program = makeProgram();
    await program.parseAsync(['node', 'pulsedock', 'monitors', 'check', 'mon-001', '--json']);
    const output = stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
    const parsed = JSON.parse(output);
    expect(parsed.status).toBe(200);
    expect(parsed.ok).toBe(true);
  });
});

describe('monitors check — pretty output', () => {
  beforeEach(() => {
    loadConfigSpy.mockReturnValue({ ...MOCK_CONFIG, defaultFormat: 'pretty' });
    apiRequestSpy.mockResolvedValue(MOCK_CHECK_RESULT);
  });

  it('prints monitor ID and result status', async () => {
    const program = makeProgram();
    await program.parseAsync(['node', 'pulsedock', 'monitors', 'check', 'mon-001']);
    const output = stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
    expect(output).toContain('mon-001');
    expect(output).toContain('UP');
  });

  it('exits 1 when check result is not ok', async () => {
    apiRequestSpy.mockResolvedValue({ ...MOCK_CHECK_RESULT, ok: false, status: 503 });
    const program = makeProgram();
    await program.parseAsync(['node', 'pulsedock', 'monitors', 'check', 'mon-001']);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('shows message when present', async () => {
    apiRequestSpy.mockResolvedValue({ ...MOCK_CHECK_RESULT, message: 'Connection timeout' });
    const program = makeProgram();
    await program.parseAsync(['node', 'pulsedock', 'monitors', 'check', 'mon-001']);
    const output = stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
    expect(output).toContain('Connection timeout');
  });
});

describe('monitors check — missing credentials', () => {
  it('exits with error when no API credentials', async () => {
    loadConfigSpy.mockReturnValue({ apiUrl: undefined, apiKey: undefined, defaultFormat: 'pretty' });
    const program = makeProgram();
    await program.parseAsync(['node', 'pulsedock', 'monitors', 'check', 'mon-001']);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

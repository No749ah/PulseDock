import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import * as configModule from '../utils/config.js';
import { registerConfigCommand } from './config.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerConfigCommand(program);
  return program;
}

const MOCK_CONFIG = {
  apiUrl: 'https://api.example.com',
  apiKey: 'pdck_testapikey1234',
  defaultFormat: 'pretty' as const,
};

// ─── Spies ────────────────────────────────────────────────────────────────────

let loadConfigSpy: ReturnType<typeof vi.spyOn>;
let saveConfigSpy: ReturnType<typeof vi.spyOn>;
let getConfigPathSpy: ReturnType<typeof vi.spyOn>;
let stdoutSpy: ReturnType<typeof vi.spyOn>;
let exitSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  loadConfigSpy = vi.spyOn(configModule, 'loadConfig').mockReturnValue({ ...MOCK_CONFIG });
  saveConfigSpy = vi.spyOn(configModule, 'saveConfig').mockImplementation(() => {});
  getConfigPathSpy = vi.spyOn(configModule, 'getConfigPath').mockReturnValue('/home/user/.pulsedock/config.json');
  stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── config set ───────────────────────────────────────────────────────────────

describe('config set — api-url', () => {
  it('saves updated apiUrl', async () => {
    const program = makeProgram();
    await program.parseAsync(['node', 'pulsedock', 'config', 'set', '--api-url', 'https://new.example.com']);
    expect(saveConfigSpy).toHaveBeenCalledWith(
      expect.objectContaining({ apiUrl: 'https://new.example.com' }),
    );
  });

  it('preserves existing apiKey when only updating apiUrl', async () => {
    const program = makeProgram();
    await program.parseAsync(['node', 'pulsedock', 'config', 'set', '--api-url', 'https://new.example.com']);
    expect(saveConfigSpy).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: MOCK_CONFIG.apiKey }),
    );
  });
});

describe('config set — api-key', () => {
  it('saves updated apiKey', async () => {
    const program = makeProgram();
    await program.parseAsync(['node', 'pulsedock', 'config', 'set', '--api-key', 'pdck_newkey']);
    expect(saveConfigSpy).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'pdck_newkey' }),
    );
  });
});

describe('config set — format', () => {
  it('saves defaultFormat=json', async () => {
    const program = makeProgram();
    await program.parseAsync(['node', 'pulsedock', 'config', 'set', '--format', 'json']);
    expect(saveConfigSpy).toHaveBeenCalledWith(
      expect.objectContaining({ defaultFormat: 'json' }),
    );
  });

  it('saves defaultFormat=pretty', async () => {
    const program = makeProgram();
    await program.parseAsync(['node', 'pulsedock', 'config', 'set', '--format', 'pretty']);
    expect(saveConfigSpy).toHaveBeenCalledWith(
      expect.objectContaining({ defaultFormat: 'pretty' }),
    );
  });

  it('exits with error for invalid format', async () => {
    const program = makeProgram();
    await program.parseAsync(['node', 'pulsedock', 'config', 'set', '--format', 'csv']);
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(saveConfigSpy).not.toHaveBeenCalled();
  });
});

describe('config set — no args', () => {
  it('exits with error when no flags provided', async () => {
    const program = makeProgram();
    await program.parseAsync(['node', 'pulsedock', 'config', 'set']);
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(saveConfigSpy).not.toHaveBeenCalled();
  });
});

describe('config set — multiple values', () => {
  it('saves all provided values in one call', async () => {
    const program = makeProgram();
    await program.parseAsync([
      'node', 'pulsedock', 'config', 'set',
      '--api-url', 'https://multi.example.com',
      '--api-key', 'pdck_multi',
      '--format', 'json',
    ]);
    expect(saveConfigSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        apiUrl: 'https://multi.example.com',
        apiKey: 'pdck_multi',
        defaultFormat: 'json',
      }),
    );
  });
});

// ─── config get ───────────────────────────────────────────────────────────────

describe('config get — pretty output', () => {
  it('shows config file path', async () => {
    const program = makeProgram();
    await program.parseAsync(['node', 'pulsedock', 'config', 'get']);
    const output = stdoutSpy.mock.calls.map((c) => c[0]).join('');
    expect(output).toContain('/home/user/.pulsedock/config.json');
  });

  it('shows API URL', async () => {
    const program = makeProgram();
    await program.parseAsync(['node', 'pulsedock', 'config', 'get']);
    const output = stdoutSpy.mock.calls.map((c) => c[0]).join('');
    expect(output).toContain('https://api.example.com');
  });

  it('redacts api key showing only last 4 chars', async () => {
    const program = makeProgram();
    await program.parseAsync(['node', 'pulsedock', 'config', 'get']);
    const output = stdoutSpy.mock.calls.map((c) => c[0]).join('');
    // Should show ***1234 (last 4 chars of pdck_testapikey1234)
    expect(output).toContain('***1234');
    expect(output).not.toContain('pdck_testapikey1234');
  });

  it('shows (not set) for missing apiUrl', async () => {
    loadConfigSpy.mockReturnValue({ apiKey: 'pdck_key', defaultFormat: 'pretty' });
    const program = makeProgram();
    await program.parseAsync(['node', 'pulsedock', 'config', 'get']);
    const output = stdoutSpy.mock.calls.map((c) => c[0]).join('');
    expect(output).toContain('(not set)');
  });

  it('shows (not set) for missing apiKey', async () => {
    loadConfigSpy.mockReturnValue({ apiUrl: 'https://api.example.com', defaultFormat: 'pretty' });
    const program = makeProgram();
    await program.parseAsync(['node', 'pulsedock', 'config', 'get']);
    const output = stdoutSpy.mock.calls.map((c) => c[0]).join('');
    expect(output).toContain('(not set)');
  });
});

describe('config get — JSON output', () => {
  it('outputs JSON with redacted api key', async () => {
    const program = makeProgram();
    await program.parseAsync(['node', 'pulsedock', 'config', 'get', '--json']);
    const output = stdoutSpy.mock.calls.map((c) => c[0]).join('');
    const parsed = JSON.parse(output);
    expect(parsed.apiUrl).toBe('https://api.example.com');
    expect(parsed.apiKey).toBe('***1234');
    expect(parsed.apiKey).not.toContain('pdck_testapikey1234');
  });

  it('omits apiKey field in JSON when not set', async () => {
    loadConfigSpy.mockReturnValue({ apiUrl: 'https://api.example.com', defaultFormat: 'json' });
    const program = makeProgram();
    await program.parseAsync(['node', 'pulsedock', 'config', 'get', '--json']);
    const output = stdoutSpy.mock.calls.map((c) => c[0]).join('');
    const parsed = JSON.parse(output);
    expect(parsed.apiKey).toBeUndefined();
  });
});

// ─── config unset ─────────────────────────────────────────────────────────────

describe('config unset', () => {
  it('unsets apiUrl', async () => {
    const program = makeProgram();
    await program.parseAsync(['node', 'pulsedock', 'config', 'unset', 'apiUrl']);
    const savedArg = saveConfigSpy.mock.calls[0][0];
    expect(savedArg).not.toHaveProperty('apiUrl');
  });

  it('unsets apiKey', async () => {
    const program = makeProgram();
    await program.parseAsync(['node', 'pulsedock', 'config', 'unset', 'apiKey']);
    const savedArg = saveConfigSpy.mock.calls[0][0];
    expect(savedArg).not.toHaveProperty('apiKey');
  });

  it('unsets format (defaultFormat)', async () => {
    const program = makeProgram();
    await program.parseAsync(['node', 'pulsedock', 'config', 'unset', 'format']);
    const savedArg = saveConfigSpy.mock.calls[0][0];
    expect(savedArg).not.toHaveProperty('defaultFormat');
  });

  it('exits with error for unknown key', async () => {
    const program = makeProgram();
    await program.parseAsync(['node', 'pulsedock', 'config', 'unset', 'unknownKey']);
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(saveConfigSpy).not.toHaveBeenCalled();
  });

  it('preserves other keys when unsetting one', async () => {
    const program = makeProgram();
    await program.parseAsync(['node', 'pulsedock', 'config', 'unset', 'apiUrl']);
    const savedArg = saveConfigSpy.mock.calls[0][0];
    expect(savedArg).toHaveProperty('apiKey', MOCK_CONFIG.apiKey);
  });
});

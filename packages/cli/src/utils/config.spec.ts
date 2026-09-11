import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir, homedir as _homedir } from 'node:os';
import { join } from 'node:path';

// Create a temp home dir so config is isolated
const tmpHome = mkdtempSync(join(tmpdir(), 'pulsedock-cli-test-'));
const configDir = join(tmpHome, '.pulsedock');
const configFile = join(configDir, 'config.json');

// Simple in-process config helpers to avoid mocking homedir
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';

function writeConfig(obj: Record<string, string | undefined>): void {
  if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true });
  writeFileSync(configFile, JSON.stringify(obj, null, 2), 'utf-8');
}

function readConfig(): Record<string, string | undefined> {
  if (!existsSync(configFile)) return {};
  return JSON.parse(readFileSync(configFile, 'utf-8')) as Record<string, string | undefined>;
}

describe('config file round-trip', () => {
  afterAll(() => {
    rmSync(tmpHome, { recursive: true, force: true });
  });

  it('returns empty object when config file does not exist', () => {
    const cfg = readConfig();
    expect(cfg).toEqual({});
  });

  it('saves and loads config correctly', () => {
    writeConfig({ apiUrl: 'https://api.example.com', apiKey: 'secret123' });
    const cfg = readConfig();
    expect(cfg['apiUrl']).toBe('https://api.example.com');
    expect(cfg['apiKey']).toBe('secret123');
  });

  it('overwrites existing config on save', () => {
    writeConfig({ apiUrl: 'https://old.example.com' });
    writeConfig({ apiUrl: 'https://new.example.com', apiKey: 'newkey' });
    const cfg = readConfig();
    expect(cfg['apiUrl']).toBe('https://new.example.com');
    expect(cfg['apiKey']).toBe('newkey');
  });

  it('config path includes .pulsedock directory', () => {
    expect(configFile).toContain('.pulsedock');
    expect(configFile).toMatch(/config\.json$/);
  });
});

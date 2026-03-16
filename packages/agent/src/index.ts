import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { BUILT_IN_CHECKS } from './checks/index';
import { logger } from './logger';
import type { AgentCheckConfig, AgentConfigFile } from './types';

// ── Config ───────────────────────────────────────────────────────────────────

const PULSEDOCK_URL = (process.env.PULSEDOCK_URL ?? '').replace(/\/+$/, '');
const PULSEDOCK_API_KEY = process.env.PULSEDOCK_API_KEY ?? '';
const CONFIG_FILE = process.env.AGENT_CONFIG_FILE ?? '/etc/pulsedock-agent/config.json';
const CHECK_INTERVAL_MS = Math.max(
  60_000,
  Number(process.env.AGENT_INTERVAL_SEC ?? 3600) * 1000,
);
const HOSTNAME = process.env.HOSTNAME ?? require('node:os').hostname();

// ── Validation ───────────────────────────────────────────────────────────────

function validateEnv(): boolean {
  if (!PULSEDOCK_URL) {
    logger.error('PULSEDOCK_URL is required');
    return false;
  }
  if (!PULSEDOCK_API_KEY) {
    logger.error('PULSEDOCK_API_KEY is required');
    return false;
  }
  return true;
}

function loadConfig(): AgentCheckConfig[] {
  if (!existsSync(CONFIG_FILE)) {
    logger.warn('No config file found, using built-in checks for all known tools', { path: CONFIG_FILE });
    return Object.keys(BUILT_IN_CHECKS).map((toolId) => ({ toolId }));
  }

  try {
    const raw = readFileSync(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as AgentConfigFile;

    if (!Array.isArray(parsed.checks)) {
      logger.error('Config file must contain a "checks" array');
      return [];
    }

    return parsed.checks.filter((c): c is AgentCheckConfig => {
      if (!c.toolId || typeof c.toolId !== 'string') {
        logger.warn('Skipping invalid check entry (missing toolId)', { entry: c });
        return false;
      }
      return true;
    });
  } catch (err) {
    logger.error('Failed to load config file', {
      path: CONFIG_FILE,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

// ── Version extraction ───────────────────────────────────────────────────────

function runCommand(command: string): string | null {
  try {
    const output = execSync(command, {
      timeout: 30_000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const trimmed = output.trim();
    return trimmed || null;
  } catch (err) {
    logger.warn('Command failed', {
      command,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

function extractVersion(raw: string): string | null {
  // Try to extract a semver-like version from the output
  const match = raw.match(/v?(\d+\.\d+(?:\.\d+)?(?:[-+][\w.-]*)?)/i);
  return match ? match[1]! : raw.trim() || null;
}

// ── Reporting ────────────────────────────────────────────────────────────────

async function reportVersion(
  toolId: string,
  version: string,
  monitorId?: string,
): Promise<boolean> {
  const url = `${PULSEDOCK_URL}/v1/agent/report`;

  const payload: Record<string, string> = { toolId, version, hostname: HOSTNAME };
  if (monitorId) payload.monitorId = monitorId;

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${PULSEDOCK_API_KEY}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      logger.error('Report failed', { toolId, status: resp.status, body: text });
      return false;
    }

    logger.info('Reported version', { toolId, version, monitorId: monitorId ?? null });
    return true;
  } catch (err) {
    logger.error('Report request failed', {
      toolId,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

// ── Main loop ────────────────────────────────────────────────────────────────

async function runChecks(checks: AgentCheckConfig[]): Promise<void> {
  logger.info('Running checks', { count: checks.length });

  for (const check of checks) {
    const command = check.command ?? BUILT_IN_CHECKS[check.toolId];

    if (!command) {
      logger.warn('No command for tool — skipping', { toolId: check.toolId });
      continue;
    }

    const raw = runCommand(command);
    if (!raw) {
      logger.warn('No output from command', { toolId: check.toolId });
      continue;
    }

    const version = extractVersion(raw);
    if (!version) {
      logger.warn('Could not extract version from output', {
        toolId: check.toolId,
        raw,
      });
      continue;
    }

    await reportVersion(check.toolId, version, check.monitorId);
  }
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;

function shutdown(): void {
  logger.info('Shutting down');
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  process.exit(0);
}

async function main(): Promise<void> {
  logger.info('PulseDock Agent starting', {
    url: PULSEDOCK_URL,
    configFile: CONFIG_FILE,
    intervalMs: CHECK_INTERVAL_MS,
    hostname: HOSTNAME,
  });

  if (!validateEnv()) {
    process.exit(1);
  }

  const checks = loadConfig();
  if (checks.length === 0) {
    logger.error('No checks configured — exiting');
    process.exit(1);
  }

  logger.info('Loaded checks', {
    count: checks.length,
    toolIds: checks.map((c) => c.toolId),
  });

  // Register signal handlers for graceful shutdown
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // Run immediately on startup
  await runChecks(checks);

  // Schedule periodic runs
  intervalHandle = setInterval(() => {
    runChecks(checks).catch((err) => {
      logger.error('Check cycle failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }, CHECK_INTERVAL_MS);

  logger.info('Agent running — next check in', {
    intervalSec: Math.round(CHECK_INTERVAL_MS / 1000),
  });
}

main().catch((err) => {
  logger.error('Fatal error', {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});

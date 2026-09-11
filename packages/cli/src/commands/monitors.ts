import { Command } from 'commander';
import chalk from 'chalk';
import { apiRequest } from '../utils/http.js';
import {
  printJson,
  printError,
  printTable,
  printInfo,
  statusColor,
  durationColor,
  type OutputFormat,
} from '../utils/output.js';
import { loadConfig } from '../utils/config.js';

interface MonitorRecord {
  id: string;
  name: string;
  target: string;
  type: string;
  enabled: boolean;
  intervalSec: number;
}

interface PaginatedEnvelope<T> {
  data: T[];
  meta: { total: number; page: number; limit: number; pages: number };
}

interface MonitorOpts {
  apiUrl?: string;
  apiKey?: string;
  json: boolean;
  limit: string;
  page: string;
}

function resolveAuth(
  opts: MonitorOpts,
  config: ReturnType<typeof loadConfig>,
): { apiUrl: string; apiKey: string } | null {
  const apiUrl = opts.apiUrl ?? config.apiUrl;
  const apiKey = opts.apiKey ?? config.apiKey;
  if (!apiUrl || !apiKey) return null;
  return { apiUrl, apiKey };
}

export function registerMonitorsCommand(program: Command): void {
  const monitors = program
    .command('monitors')
    .description('Manage and inspect PulseDock monitors (requires API access)');

  monitors
    .command('list')
    .description('List all monitors')
    .option('--api-url <url>', 'PulseDock API base URL (overrides config)')
    .option('--api-key <key>', 'PulseDock API key (overrides config)')
    .option('-l, --limit <n>', 'Results per page', '20')
    .option('-p, --page <n>', 'Page number', '1')
    .option('--json', 'Output as JSON')
    .action(async (opts: MonitorOpts) => {
      const config = loadConfig();
      const format: OutputFormat = opts.json || config.defaultFormat === 'json' ? 'json' : 'pretty';
      const auth = resolveAuth(opts, config);

      if (!auth) {
        printError(
          'API credentials required. Run `pulsedock config set --api-url <url> --api-key <key>` or pass --api-url/--api-key flags.',
        );
        process.exit(1);
        return;
      }

      const params = new URLSearchParams({
        page: opts.page,
        limit: opts.limit,
      });

      const result = await apiRequest<PaginatedEnvelope<MonitorRecord>>(
        auth.apiUrl,
        auth.apiKey,
        `/api/v2/monitors?${params.toString()}`,
      );

      if (format === 'json') {
        printJson(result);
        return;
      }

      printInfo(
        `Showing ${result.data.length} of ${result.meta.total} monitors (page ${result.meta.page}/${result.meta.pages})`,
      );
      process.stdout.write('\n');

      if (result.data.length === 0) {
        process.stdout.write(chalk.dim('  No monitors found.\n'));
        return;
      }

      printTable(
        result.data.map((m) => ({
          ID: m.id.slice(0, 8),
          Name: m.name,
          Type: m.type,
          Target: m.target.length > 40 ? m.target.slice(0, 37) + '...' : m.target,
          Interval: `${m.intervalSec}s`,
          Enabled: m.enabled ? chalk.green('yes') : chalk.dim('no'),
        })),
      );
      process.stdout.write('\n');
    });

  monitors
    .command('check <monitorId>')
    .description('Trigger an immediate check for a monitor by ID')
    .option('--api-url <url>', 'PulseDock API base URL (overrides config)')
    .option('--api-key <key>', 'PulseDock API key (overrides config)')
    .option('--json', 'Output as JSON')
    .action(async (monitorId: string, opts: MonitorOpts) => {
      const config = loadConfig();
      const format: OutputFormat = opts.json || config.defaultFormat === 'json' ? 'json' : 'pretty';
      const auth = resolveAuth(opts, config);

      if (!auth) {
        printError(
          'API credentials required. Run `pulsedock config set --api-url <url> --api-key <key>`.',
        );
        process.exit(1);
        return;
      }

      interface CheckRecord {
        id: string;
        status: number;
        latencyMs?: number;
        ok: boolean;
        checkedAt: string;
        message?: string;
      }

      const result = await apiRequest<CheckRecord>(
        auth.apiUrl,
        auth.apiKey,
        `/api/v1/monitors/${monitorId}/check`,
        { method: 'POST' },
      );

      if (format === 'json') {
        printJson(result);
        return;
      }

      process.stdout.write('\n');
      process.stdout.write(
        chalk.bold('  Monitor    ') + chalk.dim(monitorId) + '\n',
      );
      process.stdout.write(
        chalk.bold('  Status     ') + statusColor(result.status) + '\n',
      );
      if (result.latencyMs !== undefined) {
        process.stdout.write(
          chalk.bold('  Latency    ') + durationColor(result.latencyMs) + '\n',
        );
      }
      process.stdout.write(
        chalk.bold('  Result     ') +
          (result.ok ? chalk.green('UP') : chalk.red('DOWN')) +
          '\n',
      );
      if (result.message) {
        process.stdout.write(
          chalk.bold('  Message    ') + chalk.dim(result.message) + '\n',
        );
      }
      process.stdout.write('\n');

      if (!result.ok) process.exit(1);
    });
}

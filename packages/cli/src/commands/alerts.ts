import { Command } from 'commander';
import chalk from 'chalk';
import { apiRequest } from '../utils/http.js';
import {
  printJson,
  printError,
  printTable,
  printInfo,
  type OutputFormat,
} from '../utils/output.js';
import { loadConfig } from '../utils/config.js';

interface AlertChannel {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  createdAt: string;
}

interface AlertDelivery {
  id: string;
  channelId: string;
  channelName?: string;
  status: 'sent' | 'failed' | 'pending';
  sentAt?: string;
  failureReason?: string;
  monitor?: { name: string };
}

interface AlertsListEnvelope {
  channels?: AlertChannel[];
  data?: AlertChannel[];
}

interface DeliveryEnvelope {
  deliveries?: AlertDelivery[];
  data?: AlertDelivery[];
}

interface AlertOpts {
  apiUrl?: string;
  apiKey?: string;
  json: boolean;
  limit: string;
  type?: string;
}

function resolveAuth(
  opts: AlertOpts,
  config: ReturnType<typeof loadConfig>,
): { apiUrl: string; apiKey: string } | null {
  const apiUrl = opts.apiUrl ?? config.apiUrl;
  const apiKey = opts.apiKey ?? config.apiKey;
  if (!apiUrl || !apiKey) return null;
  return { apiUrl, apiKey };
}

export function registerAlertsCommand(program: Command): void {
  const alerts = program
    .command('alerts')
    .description('Inspect alert channels and recent delivery history');

  // ── alerts channels ────────────────────────────────────────────────────────

  alerts
    .command('channels')
    .description('List configured alert channels')
    .option('--api-url <url>', 'PulseDock API base URL (overrides config)')
    .option('--api-key <key>', 'PulseDock API key (overrides config)')
    .option('-l, --limit <n>', 'Results per page', '20')
    .option('--type <type>', 'Filter by channel type (e.g. SLACK, WEBHOOK, EMAIL)')
    .option('--json', 'Output as JSON')
    .action(async (opts: AlertOpts) => {
      const config = loadConfig();
      const format: OutputFormat = opts.json || config.defaultFormat === 'json' ? 'json' : 'pretty';
      const auth = resolveAuth(opts, config);

      if (!auth) {
        printError('API URL and API key are required. Run: pulsedock config set --api-url <url> --api-key <key>');
        process.exit(1);
        return;
      }

      printInfo(`Fetching alert channels from ${auth.apiUrl}…`);

      try {
        const qs = new URLSearchParams({ limit: opts.limit });
        if (opts.type) qs.set('type', opts.type.toUpperCase());

        const result = await apiRequest<AlertsListEnvelope>(
          auth.apiUrl,
          auth.apiKey,
          `/v1/alert-channels?${qs}`,
        );

        const channels = result.channels ?? result.data ?? (Array.isArray(result) ? (result as AlertChannel[]) : []);

        if (format === 'json') {
          printJson(channels);
          return;
        }

        if (channels.length === 0) {
          printInfo('No alert channels found.');
          return;
        }

        process.stdout.write('\n');
        process.stdout.write(chalk.bold(`  Alert Channels (${channels.length})\n`));
        process.stdout.write(chalk.dim('  ─────────────────────────────────────────\n'));
        process.stdout.write('\n');

        printTable(
          channels.map((c) => ({
            ID: c.id.slice(0, 8) + '…',
            Name: c.name,
            Type: c.type,
            Status: c.enabled ? chalk.green('enabled') : chalk.dim('disabled'),
          })),
        );
        process.stdout.write('\n');
      } catch (err) {
        printError(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  // ── alerts deliveries ──────────────────────────────────────────────────────

  alerts
    .command('deliveries')
    .description('Show recent alert delivery history')
    .option('--api-url <url>', 'PulseDock API base URL (overrides config)')
    .option('--api-key <key>', 'PulseDock API key (overrides config)')
    .option('-l, --limit <n>', 'Number of deliveries to show', '20')
    .option('--json', 'Output as JSON')
    .action(async (opts: AlertOpts) => {
      const config = loadConfig();
      const format: OutputFormat = opts.json || config.defaultFormat === 'json' ? 'json' : 'pretty';
      const auth = resolveAuth(opts, config);

      if (!auth) {
        printError('API URL and API key are required. Run: pulsedock config set --api-url <url> --api-key <key>');
        process.exit(1);
        return;
      }

      printInfo(`Fetching delivery history from ${auth.apiUrl}…`);

      try {
        const result = await apiRequest<DeliveryEnvelope>(
          auth.apiUrl,
          auth.apiKey,
          `/v1/alert-channels/deliveries?limit=${opts.limit}`,
        );

        const deliveries = result.deliveries ?? result.data ?? (Array.isArray(result) ? (result as AlertDelivery[]) : []);

        if (format === 'json') {
          printJson(deliveries);
          return;
        }

        if (deliveries.length === 0) {
          printInfo('No delivery records found.');
          return;
        }

        process.stdout.write('\n');
        process.stdout.write(chalk.bold(`  Recent Alert Deliveries (${deliveries.length})\n`));
        process.stdout.write(chalk.dim('  ─────────────────────────────────────────\n'));
        process.stdout.write('\n');

        printTable(
          deliveries.map((d) => ({
            ID: d.id.slice(0, 8) + '…',
            Monitor: d.monitor?.name ?? '—',
            Channel: d.channelId.slice(0, 8) + '…',
            Status: d.status === 'sent'
              ? chalk.green('sent')
              : d.status === 'failed'
                ? chalk.red('failed')
                : chalk.yellow('pending'),
            SentAt: d.sentAt ? new Date(d.sentAt).toLocaleString() : '—',
          })),
        );
        process.stdout.write('\n');
      } catch (err) {
        printError(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  // ── alerts test ────────────────────────────────────────────────────────────

  alerts
    .command('test <channelId>')
    .description('Send a test alert to a channel')
    .option('--api-url <url>', 'PulseDock API base URL (overrides config)')
    .option('--api-key <key>', 'PulseDock API key (overrides config)')
    .option('--json', 'Output as JSON')
    .action(async (channelId: string, opts: AlertOpts) => {
      const config = loadConfig();
      const format: OutputFormat = opts.json || config.defaultFormat === 'json' ? 'json' : 'pretty';
      const auth = resolveAuth(opts, config);

      if (!auth) {
        printError('API URL and API key are required. Run: pulsedock config set --api-url <url> --api-key <key>');
        process.exit(1);
        return;
      }

      printInfo(`Sending test alert to channel ${channelId}…`);

      try {
        const result = await apiRequest<{ success: boolean; message?: string }>(
          auth.apiUrl,
          auth.apiKey,
          `/v1/alert-channels/test`,
          { method: 'POST', body: { channelId } },
        );

        if (format === 'json') {
          printJson(result);
          if (!result.success) process.exit(1);
          return;
        }

        if (result.success) {
          process.stdout.write('\n');
          process.stdout.write(chalk.green('  ✓ Test alert sent successfully\n'));
          process.stdout.write('\n');
        } else {
          process.stdout.write('\n');
          process.stdout.write(chalk.red(`  ✗ Test alert failed: ${result.message ?? 'unknown error'}\n`));
          process.stdout.write('\n');
          process.exit(1);
        }
      } catch (err) {
        printError(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}

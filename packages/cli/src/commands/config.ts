import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig, saveConfig, getConfigPath, type CliConfig } from '../utils/config.js';
import { printSuccess, printError, printJson } from '../utils/output.js';

interface SetOpts {
  apiUrl?: string;
  apiKey?: string;
  format?: string;
}

export function registerConfigCommand(program: Command): void {
  const config = program
    .command('config')
    .description('Manage CLI configuration (~/.pulsedock/config.json)');

  config
    .command('set')
    .description('Set configuration values')
    .option('--api-url <url>', 'PulseDock API base URL (e.g. https://api.example.com)')
    .option('--api-key <key>', 'PulseDock API key')
    .option(
      '--format <format>',
      'Default output format: pretty or json',
    )
    .action((opts: SetOpts) => {
      const current = loadConfig();
      const updated: CliConfig = { ...current };

      let changed = false;

      if (opts.apiUrl) {
        updated.apiUrl = opts.apiUrl;
        changed = true;
      }
      if (opts.apiKey) {
        updated.apiKey = opts.apiKey;
        changed = true;
      }
      if (opts.format) {
        if (opts.format !== 'pretty' && opts.format !== 'json') {
          printError('--format must be "pretty" or "json"');
          process.exit(1);
          return;
        }
        updated.defaultFormat = opts.format;
        changed = true;
      }

      if (!changed) {
        printError('No values to set. Use --api-url, --api-key, or --format.');
        process.exit(1);
        return;
      }

      saveConfig(updated);
      printSuccess(`Configuration saved to ${getConfigPath()}`);
    });

  config
    .command('get')
    .description('Show current configuration')
    .option('--json', 'Output as JSON')
    .action((opts: { json?: boolean }) => {
      const current = loadConfig();

      if (opts.json) {
        // Redact api key in output
        printJson({
          ...current,
          apiKey: current.apiKey ? '***' + current.apiKey.slice(-4) : undefined,
        });
        return;
      }

      process.stdout.write('\n');
      process.stdout.write(
        chalk.bold('  Config file  ') + chalk.dim(getConfigPath()) + '\n',
      );
      process.stdout.write(
        chalk.bold('  API URL      ') +
          (current.apiUrl ? chalk.cyan(current.apiUrl) : chalk.dim('(not set)')) +
          '\n',
      );
      process.stdout.write(
        chalk.bold('  API Key      ') +
          (current.apiKey
            ? chalk.dim('***' + current.apiKey.slice(-4))
            : chalk.dim('(not set)')) +
          '\n',
      );
      process.stdout.write(
        chalk.bold('  Format       ') +
          chalk.dim(current.defaultFormat ?? 'pretty') +
          '\n',
      );
      process.stdout.write('\n');
    });

  config
    .command('unset <key>')
    .description('Remove a configuration key (apiUrl | apiKey | format)')
    .action((key: string) => {
      const current = loadConfig();
      const validKeys = ['apiUrl', 'apiKey', 'format'] as const;
      const mapped: Record<string, keyof CliConfig> = {
        apiUrl: 'apiUrl',
        apiKey: 'apiKey',
        format: 'defaultFormat',
      };

      if (!validKeys.includes(key as (typeof validKeys)[number])) {
        printError(`Unknown key "${key}". Valid keys: ${validKeys.join(', ')}`);
        process.exit(1);
        return;
      }

      const configKey = mapped[key];
      if (configKey) {
        delete current[configKey];
      }
      saveConfig(current);
      printSuccess(`Unset ${key}`);
    });
}

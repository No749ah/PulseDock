import { Command } from 'commander';
import chalk from 'chalk';
import { httpCheck } from '../utils/http.js';
import {
  printJson,
  printError,
  printWarning,
  statusColor,
  durationColor,
  formatBytes,
  type OutputFormat,
} from '../utils/output.js';
import { loadConfig } from '../utils/config.js';

interface CheckOptions {
  method: string;
  timeout: string;
  json: boolean;
  noFollow: boolean;
  header: string[];
  expect: string;
}

export function registerCheckCommand(program: Command): void {
  program
    .command('check <url>')
    .description('Perform a one-shot HTTP check against a URL')
    .option('-m, --method <method>', 'HTTP method to use', 'GET')
    .option('-t, --timeout <ms>', 'Request timeout in milliseconds', '10000')
    .option('--no-follow', 'Do not follow redirects')
    .option(
      '-H, --header <header>',
      'Extra request header (repeatable, format: "Key: Value")',
      (val: string, acc: string[]) => [...acc, val],
      [] as string[],
    )
    .option(
      '-e, --expect <status>',
      'Expect a specific HTTP status code (exit 1 if mismatch)',
    )
    .option('--json', 'Output result as JSON')
    .action(async (url: string, opts: CheckOptions) => {
      const config = loadConfig();
      const format: OutputFormat = opts.json || config.defaultFormat === 'json' ? 'json' : 'pretty';

      // Parse extra headers
      const extraHeaders: Record<string, string> = {};
      for (const h of opts.header) {
        const sep = h.indexOf(':');
        if (sep === -1) {
          printWarning(`Invalid header (expected "Key: Value"): ${h}`);
          continue;
        }
        const key = h.slice(0, sep).trim();
        const val = h.slice(sep + 1).trim();
        extraHeaders[key] = val;
      }

      const result = await httpCheck(url, {
        method: opts.method.toUpperCase(),
        timeoutMs: parseInt(opts.timeout, 10),
        followRedirects: !opts.noFollow,
        headers: extraHeaders,
      });

      if (format === 'json') {
        printJson(result);
        process.exit(result.ok ? 0 : 1);
        return;
      }

      // Pretty output
      const statusLine = result.status === 0
        ? chalk.red('CONNECTION ERROR')
        : statusColor(result.status) + ' ' + chalk.dim(result.statusText);

      process.stdout.write('\n');
      process.stdout.write(
        chalk.bold('  URL        ') + chalk.cyan(url) + '\n',
      );
      process.stdout.write(
        chalk.bold('  Status     ') + statusLine + '\n',
      );
      process.stdout.write(
        chalk.bold('  Duration   ') + durationColor(result.durationMs) + '\n',
      );

      if (result.contentLength !== null) {
        process.stdout.write(
          chalk.bold('  Size       ') +
            chalk.dim(formatBytes(result.contentLength)) +
            '\n',
        );
      }
      if (result.contentType) {
        process.stdout.write(
          chalk.bold('  Type       ') + chalk.dim(result.contentType) + '\n',
        );
      }
      if (result.redirectedTo) {
        process.stdout.write(
          chalk.bold('  Redirected ') + chalk.dim(result.redirectedTo) + '\n',
        );
      }
      if (result.error) {
        process.stdout.write(
          chalk.bold('  Error      ') + chalk.red(result.error) + '\n',
        );
      }
      process.stdout.write('\n');

      // Expect check
      if (opts.expect) {
        const expected = parseInt(opts.expect, 10);
        if (result.status !== expected) {
          printError(
            `Expected status ${expected}, got ${result.status}`,
          );
          process.exit(1);
          return;
        }
      }

      if (!result.ok) {
        process.exit(1);
      }
    });
}

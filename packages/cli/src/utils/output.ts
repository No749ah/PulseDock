import chalk from 'chalk';

export type OutputFormat = 'pretty' | 'json';

export function printJson(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

export function printSuccess(msg: string): void {
  process.stderr.write(chalk.green('✓') + ' ' + msg + '\n');
}

export function printError(msg: string): void {
  process.stderr.write(chalk.red('✗') + ' ' + msg + '\n');
}

export function printWarning(msg: string): void {
  process.stderr.write(chalk.yellow('⚠') + ' ' + msg + '\n');
}

export function printInfo(msg: string): void {
  process.stderr.write(chalk.dim(msg) + '\n');
}

export function statusColor(status: number): string {
  if (status >= 200 && status < 300) return chalk.green(String(status));
  if (status >= 300 && status < 400) return chalk.cyan(String(status));
  if (status >= 400 && status < 500) return chalk.yellow(String(status));
  return chalk.red(String(status));
}

export function durationColor(ms: number): string {
  if (ms < 200) return chalk.green(`${ms}ms`);
  if (ms < 800) return chalk.yellow(`${ms}ms`);
  return chalk.red(`${ms}ms`);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export function printTable(rows: Record<string, string>[]): void {
  if (rows.length === 0) return;
  const keys = Object.keys(rows[0] ?? {});
  const widths = keys.map((k) =>
    Math.max(k.length, ...rows.map((r) => String(r[k] ?? '').length)),
  );

  const header = keys
    .map((k, i) => chalk.bold(k.padEnd(widths[i] ?? k.length)))
    .join('  ');
  const divider = widths.map((w) => '─'.repeat(w)).join('  ');

  process.stdout.write(header + '\n');
  process.stdout.write(chalk.dim(divider) + '\n');
  for (const row of rows) {
    const line = keys
      .map((k, i) => String(row[k] ?? '').padEnd(widths[i] ?? 0))
      .join('  ');
    process.stdout.write(line + '\n');
  }
}

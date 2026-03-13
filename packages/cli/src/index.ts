import { Command } from 'commander';
import { registerCheckCommand } from './commands/check.js';
import { registerMonitorsCommand } from './commands/monitors.js';
import { registerConfigCommand } from './commands/config.js';

const program = new Command();

program
  .name('pulsedock')
  .version('0.1.0')
  .description(
    'PulseDock CLI — one-shot HTTP checker & monitor management tool',
  );

registerCheckCommand(program);
registerMonitorsCommand(program);
registerConfigCommand(program);

program.parse(process.argv);

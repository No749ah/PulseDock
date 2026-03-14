#!/usr/bin/env node
import('../dist/index.js').catch((err) => {
  process.stderr.write('Error: ' + String(err) + '\n');
  process.exit(1);
});

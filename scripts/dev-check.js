// Simple dev:check script — checks if canonical ports are available
const net = require('net');
const ports = [3000, 4000];

function checkPort(port) {
  return new Promise((resolve) => {
    const srv = net.createServer().once('error', () => resolve(false)).once('listening', () => srv.close(() => resolve(true))).listen(port);
  });
}

(async () => {
  const results = await Promise.all(ports.map((p) => checkPort(p)));
  const busy = ports.filter((_, i) => !results[i]);
  if (busy.length) {
    console.error(`Port conflict: the following ports are already in use: ${busy.join(', ')}\nExpected free ports: ${ports.join(', ')}.`);
    console.error('If you intentionally run services on these ports, update .env.example and README to match your setup.');
    process.exit(2);
  }
  console.log('dev:check OK — canonical ports are free:', ports.join(', '));
})();

const { spawn } = require('child_process');
const http = require('http');
const socketio = require('socket.io');

const PORT = process.env.PORT || process.env.WEB_PORT || 3000;
const START_CMD = process.env.START_CMD || `npx next start -p ${PORT}`;

console.log('Starting web wrapper, will run:', START_CMD);

// Spawn the actual web process
const child = spawn(START_CMD, { shell: true, stdio: 'inherit', env: { ...process.env, PORT } });

// Create a control HTTP server for socket.io on the same port as the app's exposed port
// We don't proxy app traffic here; socket.io control uses the same origin when called locally.
const controlServer = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('ok');
});
const io = socketio(controlServer, { cors: { origin: '*' } });

io.on('connection', (socket) => {
  console.log('Control connection established');
  socket.on('npmStop', () => {
    console.log('Received npmStop — shutting down child process');
    try {
      child.kill('SIGTERM');
    } catch (e) {
      console.error('failed to kill child', e);
    }
    setTimeout(() => process.exit(0), 1000);
  });
});

controlServer.listen(PORT, () => {
  console.log(`Control server listening on http://localhost:${PORT}`);
});

child.on('exit', (code, sig) => {
  console.log('Child exited', code, sig);
  process.exit(code || 0);
});

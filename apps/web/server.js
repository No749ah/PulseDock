const { spawn } = require('child_process');
const http = require('http');
const socketio = require('socket.io');

// Prefer explicit CONTROL_PORT for the control socket, otherwise use WEB_PORT or PORT
const APP_PORT = process.env.WEB_PORT || process.env.PORT || process.env.APP_PORT || 3000;
const CONTROL_PORT = process.env.CONTROL_PORT || APP_PORT;
// START_CMD may be provided; default to next start with the app port
const START_CMD = process.env.START_CMD || `npx next start -p ${APP_PORT}`;

console.log('Starting web wrapper, will run:', START_CMD);

// Spawn the actual web process with PORT set correctly
const childEnv = { ...process.env, PORT: String(APP_PORT) };
const child = spawn(START_CMD, { shell: true, stdio: 'inherit', env: childEnv });

// Control server listens on CONTROL_PORT (defaults to the app's port). This avoids accidental binding to 3000 when APP_PORT differs.
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

controlServer.listen(Number(CONTROL_PORT), () => {
  console.log(`Control server listening on http://localhost:${CONTROL_PORT}`);
});

child.on('exit', (code, sig) => {
  console.log('Child exited', code, sig);
  process.exit(code || 0);
});

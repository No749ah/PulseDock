const { spawn } = require('child_process');
const http = require('http');
const socketio = require('socket.io');

const APP_PORT = process.env.API_PORT || process.env.PORT || process.env.APP_PORT || 4000;
const CONTROL_PORT = process.env.CONTROL_PORT || APP_PORT;
const START_CMD = process.env.START_CMD || `node dist/main.js`;

console.log('Starting api wrapper, will run:', START_CMD);

const childEnv = { ...process.env, PORT: String(APP_PORT) };
const child = spawn(START_CMD, { shell: true, stdio: 'inherit', env: childEnv });

const controlServer = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('ok');
});
const io = socketio(controlServer, { cors: { origin: '*' } });

io.on('connection', (socket) => {
  console.log('Control connection established (api)');
  socket.on('npmStop', () => {
    console.log('Received npmStop — shutting down api child process');
    try { child.kill('SIGTERM'); } catch (e) { console.error(e); }
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

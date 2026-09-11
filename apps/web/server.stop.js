const io = require('socket.io-client');
const url = process.env.CONTROL_URL || 'http://localhost';
const APP_PORT = process.env.WEB_PORT || process.env.PORT || process.env.APP_PORT || 3000;
const CONTROL_PORT = process.env.CONTROL_PORT || APP_PORT;
const socket = io.connect(`${url}:${CONTROL_PORT}`, { reconnectionAttempts: 5, timeout: 2000 });
socket.on('connect', () => {
  console.log('Connected to control server, sending npmStop');
  socket.emit('npmStop');
  setTimeout(() => process.exit(0), 1000);
});
socket.on('connect_error', (err) => {
  console.error('connect_error', err.message);
  process.exit(1);
});

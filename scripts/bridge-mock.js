// Fake bridge client: connects through the WebSocket hello handshake path
// (same registration the ws-hub accepts), then stays alive for N seconds
// (default 10). Used by QA to flip the server's connection state without a
// real browser. The real userscript registers via POST /api/connect + poll.
const WebSocket = require('ws');

const port = process.env.BRIDGE_PORT || '19422';
const lifetime = Number(process.argv[2] || 10);
const ws = new WebSocket(`ws://127.0.0.1:${port}/`);

ws.on('open', () => {
  ws.send(JSON.stringify({
    type: 'hello',
    site: 'douyin.com',
    url: 'https://www.douyin.com/',
    title: '抖音',
  }));
  console.log('READY');
  setTimeout(() => {
    ws.close();
    process.exit(0);
  }, lifetime * 1000);
});

ws.on('error', err => {
  console.error('BRIDGE_MOCK_FAIL', err.message);
  process.exit(1);
});

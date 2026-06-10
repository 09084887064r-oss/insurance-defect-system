// SSE (Server-Sent Events) service for real-time notifications
const clients = new Map(); // userId -> response

function sseMiddleware(req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const userId = req.query.userId || 'anonymous';
  clients.set(userId, res);

  res.write(`data: ${JSON.stringify({ type: 'connected', message: '实时连接建立成功' })}\n\n`);

  // Keep alive ping
  const keepAlive = setInterval(() => {
    res.write(`:ping\n\n`);
  }, 30000);

  req.on('close', () => {
    clearInterval(keepAlive);
    clients.delete(userId);
  });
}

function broadcast(data) {
  const message = `data: ${JSON.stringify(data)}\n\n`;
  clients.forEach((res) => {
    try { res.write(message); } catch (e) { /* client disconnected */ }
  });
}

function sendToUser(userId, data) {
  const res = clients.get(String(userId));
  if (res) {
    try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch (e) { /* disconnected */ }
  }
}

module.exports = { sseMiddleware, broadcast, sendToUser, sseClients: clients };

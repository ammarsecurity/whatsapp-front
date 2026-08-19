const jwt = require('jsonwebtoken');
const { WebSocketServer } = require('ws');
const User = require('../models/User');

/** @type {Map<number, Set<import('ws').WebSocket>>} */
const userSockets = new Map();

function broadcast(userId, event, data) {
  const set = userSockets.get(userId);
  if (!set || !set.size) return;
  const msg = JSON.stringify({ event, data, ts: Date.now() });
  for (const ws of set) {
    if (ws.readyState === 1) {
      ws.send(msg);
    }
  }
}

function attach(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', async (ws, req) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const token = url.searchParams.get('token');
      if (!token) {
        ws.close(4001, 'No token');
        return;
      }

      const bare = token.startsWith('Bearer ') ? token.slice(7) : token;
      const decoded = jwt.verify(
        bare,
        process.env.JWT_SECRET || 'your-secret-key-change-in-production',
      );
      const user = await User.findById(decoded.userId);
      if (!user) {
        ws.close(4003, 'User not found');
        return;
      }

      const uid = decoded.userId;
      if (!userSockets.has(uid)) userSockets.set(uid, new Set());
      userSockets.get(uid).add(ws);

      ws.send(JSON.stringify({ event: 'connected', data: { userId: uid } }));

      ws.on('close', () => {
        userSockets.get(uid)?.delete(ws);
        if (userSockets.get(uid)?.size === 0) userSockets.delete(uid);
      });

      ws.on('error', () => {
        userSockets.get(uid)?.delete(ws);
      });
    } catch {
      ws.close(4002, 'Invalid token');
    }
  });

  console.log('WebSocket server attached at /ws');
  return wss;
}

module.exports = { attach, broadcast };

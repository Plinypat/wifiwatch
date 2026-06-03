/**
 * RuView Sensing Server
 *
 * Endpoints:
 *   GET  /health                    → { status: "ok", ... }
 *   GET  /api/status                → server + active app state
 *   POST /api/app/start             → { app: "presence"|"vitals"|"pose"|"sleep"|"mat"|"pointcloud" }
 *   POST /api/app/stop              → stop active app
 *   GET  /api/devices               → list of connected ESP32 nodes
 *
 *   WS   /ws/sensing                → streams SensingFrame JSON to frontend clients
 *   WS   /ws/esp32                  → ESP32 nodes push raw CSI frames here
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { processCSI } from './sensing/processor.js';
import { DemoEmitter } from './sensing/demo-emitter.js';

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// ---- Express app ----

const app = express();
app.use(cors());
app.use(express.json());

// Health check — frontend auto-detect probes this
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    app: state.activeApp,
    nodes: state.nodes.size,
    uptime_s: Math.round(process.uptime()),
  });
});

app.get('/api/status', (_req, res) => {
  res.json({
    active_app: state.activeApp,
    nodes: [...state.nodes.values()],
    frontend_clients: frontendClients.size,
    frames_sent: state.framesSent,
    uptime_s: Math.round(process.uptime()),
  });
});

app.post('/api/app/start', (req, res) => {
  const { app: appId = 'presence', params = {} } = req.body;
  const valid = ['presence', 'vitals', 'pose', 'sleep', 'mat', 'pointcloud'];
  if (!valid.includes(appId)) {
    return res.status(400).json({ error: `Unknown app "${appId}". Valid: ${valid.join(', ')}` });
  }
  state.activeApp = appId;
  state.appParams = params;
  demoEmitter.setApp(appId);
  console.log(`[server] App started: ${appId}`, params);
  res.json({ ok: true, app: appId });
});

app.post('/api/app/stop', (_req, res) => {
  console.log(`[server] App stopped (was: ${state.activeApp})`);
  state.activeApp = null;
  demoEmitter.setApp(null);
  res.json({ ok: true });
});

app.get('/api/devices', (_req, res) => {
  res.json([...state.nodes.values()]);
});

// ---- HTTP server + WebSocket servers ----

const httpServer = createServer(app);

// Frontend clients subscribe here — receive SensingFrame JSON
const frontendWss = new WebSocketServer({ noServer: true });
const frontendClients = new Set();

// ESP32 nodes push raw CSI here
const esp32Wss = new WebSocketServer({ noServer: true });

httpServer.on('upgrade', (req, socket, head) => {
  if (req.url === '/ws/sensing') {
    frontendWss.handleUpgrade(req, socket, head, (ws) => {
      frontendWss.emit('connection', ws, req);
    });
  } else if (req.url === '/ws/esp32') {
    esp32Wss.handleUpgrade(req, socket, head, (ws) => {
      esp32Wss.emit('connection', ws, req);
    });
  } else {
    socket.destroy();
  }
});

// ---- Frontend client handling ----

frontendWss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;
  frontendClients.add(ws);
  console.log(`[frontend] Client connected from ${ip} (total: ${frontendClients.size})`);
  ws.on('close', () => {
    frontendClients.delete(ws);
    console.log(`[frontend] Client disconnected (remaining: ${frontendClients.size})`);
  });
  ws.on('error', () => frontendClients.delete(ws));
});

function broadcast(frame) {
  const payload = JSON.stringify(frame);
  for (const ws of frontendClients) {
    if (ws.readyState === ws.OPEN) {
      ws.send(payload);
    }
  }
  state.framesSent++;
}

// ---- ESP32 node handling ----

esp32Wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;
  const nodeId = `node_${ip.replace(/[.:]/g, '_')}`;
  state.nodes.set(nodeId, { id: nodeId, ip, connected_at: new Date().toISOString(), frames: 0 });
  console.log(`[esp32] Node connected: ${nodeId}`);

  ws.on('message', (raw) => {
    try {
      const csiFrame = JSON.parse(raw.toString());
      const node = state.nodes.get(nodeId);
      if (node) node.frames++;

      // Process CSI frame → SensingFrame and broadcast to frontend
      const sensingFrame = processCSI(csiFrame, state.activeApp, state.appParams);
      if (sensingFrame) broadcast(sensingFrame);
    } catch (err) {
      console.warn(`[esp32] Bad frame from ${nodeId}:`, err.message);
    }
  });

  ws.on('close', () => {
    state.nodes.delete(nodeId);
    console.log(`[esp32] Node disconnected: ${nodeId}`);
  });
  ws.on('error', () => state.nodes.delete(nodeId));
});

// ---- Demo emitter (when no ESP32 is connected) ----

const demoEmitter = new DemoEmitter();
demoEmitter.setApp('presence');

// Emit demo frames at ~12 Hz when no real nodes are connected
const DEMO_INTERVAL_MS = 83;
setInterval(() => {
  if (state.nodes.size === 0 && frontendClients.size > 0) {
    const frame = demoEmitter.next();
    if (frame) broadcast(frame);
  }
}, DEMO_INTERVAL_MS);

// ---- State ----

const state = {
  activeApp: 'presence',
  appParams: {},
  nodes: new Map(),
  framesSent: 0,
};

// ---- Start ----

httpServer.listen(PORT, HOST, () => {
  console.log(`[server] RuView sensing server running on ${HOST}:${PORT}`);
  console.log(`[server]   /health        → health check`);
  console.log(`[server]   /ws/sensing    → frontend WebSocket`);
  console.log(`[server]   /ws/esp32      → ESP32 WebSocket`);
});

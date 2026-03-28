#!/usr/bin/env node
/**
 * AgentPrime Server / Hub Node
 * Run on Raspberry Pi, a server, or spare PC. Matrix Agent can send shell commands
 * and notifications to this node for 24/7 autonomy.
 *
 * Usage:
 *   npm install && node run.js
 *   PAIRING_CODE=ABC123 AGENTPRIME_HOST=192.168.1.100 node run.js
 *   node run.js --code ABC123 --host 192.168.1.100
 *
 * Get the pairing code from AgentPrime: Matrix Systems → Nodes → Generate pairing code
 */

const WebSocket = require('ws');
const { spawn } = require('child_process');

const PORT = 18792;
const host = process.env.AGENTPRIME_HOST || (() => { const i = process.argv.indexOf('--host'); return i >= 0 ? process.argv[i + 1] : null; })() || 'localhost';
const code = process.env.PAIRING_CODE || (() => { const i = process.argv.indexOf('--code'); return i >= 0 ? process.argv[i + 1] : null; })() || '';

function send(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ ...obj, timestamp: Date.now() }));
  }
}

async function runShell(command, args = []) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d) => { stdout += d.toString(); });
    child.stderr?.on('data', (d) => { stderr += d.toString(); });
    child.on('close', (exitCode) => {
      resolve({ success: exitCode === 0, stdout: stdout.trim(), stderr: stderr.trim(), exitCode });
    });
    child.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
  });
}

async function handleCommand(ws, payload, commandId) {
  const { type, params } = payload;
  let result = { success: false, data: null, error: null };

  try {
    if (type === 'shell.execute') {
      const cmd = params?.command || '';
      const args = Array.isArray(params?.args) ? params.args : [];
      const res = await runShell(cmd, args);
      result.success = res.success;
      result.data = res.stdout || res.stderr || null;
      if (res.error) result.error = res.error;
    } else if (type === 'notification.send') {
      const title = params?.title || '';
      const body = params?.body || '';
      console.log(`[Notification] ${title}: ${body}`);
      result.success = true;
      result.data = 'Notification displayed';
    } else {
      result.error = `Unknown command type: ${type}`;
    }
  } catch (e) {
    result.error = e.message;
  }

  send(ws, {
    type: 'response',
    payload: { commandId, success: result.success, data: result.data, error: result.error }
  });
}

function connect() {
  const wsUrl = `ws://${host}:${PORT}`;
  console.log(`Connecting to ${wsUrl}...`);
  const ws = new WebSocket(wsUrl);

  ws.on('open', () => {
    send(ws, {
      type: 'pair',
      payload: {
        code: code.toUpperCase(),
        nodeInfo: {
          name: process.env.NODE_NAME || 'Server Hub',
          type: 'server',
          platform: process.platform,
          capabilities: ['commands', 'notifications']
        }
      }
    });
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'command') {
        const pl = msg.payload || {};
        handleCommand(ws, pl, pl.id);
      } else if (msg.type === 'ping') {
        send(ws, { type: 'pong', payload: {} });
      } else if (msg.type === 'unpair') {
        console.log('Unpaired by AgentPrime. Exiting.');
        process.exit(0);
      }
    } catch (e) {
      console.error('Message error:', e.message);
    }
  });

  ws.on('close', () => {
    console.log('Disconnected. Reconnecting in 5s...');
    setTimeout(connect, 5000);
  });
  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
  });
}

if (!code) {
  console.log(`
Usage:
  PAIRING_CODE=<code> AGENTPRIME_HOST=<ip> node run.js
  node run.js --code <code> [--host <ip>]

Get the pairing code from AgentPrime: open Matrix Agent → SYSTEMS → Nodes → Generate pairing code.
Use your PC's IP for AGENTPRIME_HOST when running on another machine (e.g. Raspberry Pi).
`);
  process.exit(1);
}

connect();

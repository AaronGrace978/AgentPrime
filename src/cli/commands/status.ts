/**
 * Status command - Check system status
 */

import chalk from 'chalk';
import * as http from 'http';
import * as os from 'os';

interface ServiceStatus {
  name: string;
  running: boolean;
  port?: number;
  details?: string;
}

async function checkPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port, timeout: 1000 }, (res) => {
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

async function checkWebSocket(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const WebSocket = require('ws');
      const ws = new WebSocket(`ws://127.0.0.1:${port}`);
      const timeout = setTimeout(() => {
        ws.terminate();
        resolve(false);
      }, 2000);
      
      ws.on('open', () => {
        clearTimeout(timeout);
        ws.close();
        resolve(true);
      });
      ws.on('error', () => {
        clearTimeout(timeout);
        resolve(false);
      });
    } catch {
      resolve(false);
    }
  });
}

export async function checkStatus() {
  console.log(chalk.bold('\n🔮 AgentPrime Status\n'));
  
  const services: ServiceStatus[] = [];
  
  // Check Gateway
  const gatewayPort = 18789;
  const gatewayRunning = await checkWebSocket(gatewayPort);
  services.push({
    name: 'Gateway',
    running: gatewayRunning,
    port: gatewayPort,
    details: gatewayRunning ? 'WebSocket server active' : 'Not running'
  });
  
  // Check Control UI
  const controlUIPort = 18790;
  const controlUIRunning = await checkPort(controlUIPort);
  services.push({
    name: 'Control UI',
    running: controlUIRunning,
    port: controlUIPort,
    details: controlUIRunning ? 'Web interface available' : 'Not running'
  });
  
  // Check Browser Controller
  const browserPort = 18791;
  const browserRunning = await checkPort(browserPort);
  services.push({
    name: 'Browser Controller',
    running: browserRunning,
    port: browserPort,
    details: browserRunning ? 'CDP active' : 'Not running'
  });
  
  // Check Inference Server
  const inferencePort = 11411;
  const inferenceRunning = await checkPort(inferencePort);
  services.push({
    name: 'Inference Server',
    running: inferenceRunning,
    port: inferencePort,
    details: inferenceRunning ? 'OpenAI-compatible API' : 'Not running'
  });
  
  // Print status table
  console.log(chalk.cyan('Services:'));
  console.log('─'.repeat(50));
  
  for (const service of services) {
    const status = service.running 
      ? chalk.green('● RUNNING') 
      : chalk.gray('○ STOPPED');
    const port = service.port ? chalk.gray(`:${service.port}`) : '';
    console.log(`  ${status} ${chalk.bold(service.name)}${port}`);
    if (service.details) {
      console.log(`           ${chalk.gray(service.details)}`);
    }
  }
  
  console.log('─'.repeat(50));
  
  // System resources
  console.log('');
  console.log(chalk.cyan('System:'));
  const memUsed = process.memoryUsage().heapUsed / 1024 / 1024;
  const memTotal = os.totalmem() / 1024 / 1024 / 1024;
  const memFree = os.freemem() / 1024 / 1024 / 1024;
  const cpuLoad = os.loadavg()[0];
  
  console.log(`  Memory: ${memFree.toFixed(1)}GB free / ${memTotal.toFixed(1)}GB total`);
  console.log(`  CPU Load: ${cpuLoad.toFixed(2)}`);
  console.log(`  Uptime: ${(os.uptime() / 3600).toFixed(1)} hours`);
  
  // Quick actions
  console.log('');
  console.log(chalk.cyan('Quick Actions:'));
  console.log(`  ${chalk.gray('agentprime gateway')}     Start the gateway`);
  console.log(`  ${chalk.gray('agentprime doctor')}      Run diagnostics`);
  console.log(`  ${chalk.gray('agentprime agent -m')}    Send a message`);
  console.log('');
}

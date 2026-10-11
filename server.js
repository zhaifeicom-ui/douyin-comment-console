#!/usr/bin/env node
// Bridge Server entry point. Can be started directly by Node or embedded by the desktop shell.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { getConfigPath } = require('./lib/paths');

function readConfig(configPath) {
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (error) {
    throw new Error(`未找到或无法读取配置文件：${configPath}。请先复制 config.example.json 并填写配置。\n${error.message}`);
  }
}

function startServer(options = {}) {
  const configPath = path.resolve(options.configPath || getConfigPath());
  const config = readConfig(configPath);
  config.bridge ||= {};
  config.bridge.host ||= '127.0.0.1';
  config.bridge.port = Number(config.bridge.port) || 19422;

  if (!config.bridge.token) {
    config.bridge.token = crypto.randomBytes(24).toString('hex');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    console.error('[server] 已自动生成本机 Bridge token 并写入数据目录');
  }

  // Load path-sensitive modules only after the caller has selected the data directory.
  const { ConnectionRegistry } = require('./lib/server/registry');
  const { WebSocketHub } = require('./lib/server/ws-hub');
  const { Router } = require('./lib/server/router');

  const registry = new ConnectionRegistry();
  const wsHub = new WebSocketHub({
    registry,
    port: config.bridge.port,
    host: config.bridge.host,
    heartbeatInterval: config.bridge.heartbeatInterval,
    heartbeatTimeout: config.bridge.heartbeatTimeout,
    heartbeatMaxFailures: config.bridge.heartbeatMaxFailures,
    maxPayload: config.bridge.maxBodySize,
  });
  const router = new Router({
    registry,
    wsHub,
    requestTimeout: config.bridge.requestTimeout || 30000,
    token: config.bridge.token,
    maxBodySize: config.bridge.maxBodySize,
  });
  const httpServer = http.createServer((req, res) => router.handle(req, res));
  wsHub.attach(httpServer);

  const ready = new Promise((resolve, reject) => {
    const onError = error => reject(error);
    httpServer.once('error', onError);
    httpServer.listen(config.bridge.port, config.bridge.host, () => {
      httpServer.removeListener('error', onError);
      console.error(`[server] Bridge Server ready — http://${config.bridge.host}:${config.bridge.port}`);
      console.error(`[server] Health:  http://${config.bridge.host}:${config.bridge.port}/api/health`);
      console.error(`[server] Status:  http://${config.bridge.host}:${config.bridge.port}/api/status`);
      console.error(`[server] App:     http://${config.bridge.host}:${config.bridge.port}/app`);
      console.error(`[server] WebSocket: ws://${config.bridge.host}:${config.bridge.port}/ws`);
      console.error('[server] Waiting for Tampermonkey scripts to connect...');
      resolve();
    });
  });

  let closing;
  const close = () => {
    if (closing) return closing;
    closing = (async () => {
      if (httpServer.listening) {
        await new Promise(resolve => httpServer.close(resolve));
      }
      await wsHub.stop();
      if (typeof router.close === 'function') router.close();
    })();
    return closing;
  };

  return { config, configPath, registry, wsHub, router, httpServer, ready, close };
}

if (require.main === module) {
  let server;
  try {
    server = startServer();
  } catch (error) {
    console.error(`[server] ${error.message}`);
    process.exitCode = 1;
  }

  if (server) {
    server.ready.catch(async error => {
      console.error(`[server] 启动失败：${error.message}`);
      await server.close().catch(() => {});
      process.exitCode = 1;
    });
    const shutdown = async () => {
      console.error('\n[server] Shutting down...');
      await server.close();
      process.exit(0);
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  }
}

module.exports = { startServer, readConfig };

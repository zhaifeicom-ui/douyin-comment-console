#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectDir = __dirname;
const config = JSON.parse(fs.readFileSync(path.join(projectDir, 'config.json'), 'utf8'));
const host = config.bridge?.host || '127.0.0.1';
const browserHost = ['0.0.0.0', '::'].includes(host) ? '127.0.0.1' : host;
const port = Number(config.bridge?.port) || 19422;
const appUrl = `http://${browserHost}:${port}/app`;
const healthUrl = `http://${browserHost}:${port}/api/health`;

function openBrowser(url) {
  if (process.platform === 'win32') {
    const child = spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true });
    child.unref();
    return;
  }
  const command = process.platform === 'darwin' ? 'open' : 'xdg-open';
  const child = spawn(command, [url], { detached: true, stdio: 'ignore' });
  child.unref();
}

async function isRunning() {
  try {
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch (_) {
    return false;
  }
}

async function waitUntilReady() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await isRunning()) return true;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return false;
}

async function main() {
  if (await isRunning()) {
    console.log(`[launcher] 工作台已经在运行：${appUrl}`);
    openBrowser(appUrl);
    return;
  }

  const server = spawn(process.execPath, ['server.js'], {
    cwd: projectDir,
    stdio: 'inherit',
  });
  server.on('error', error => {
    console.error(`[launcher] 启动失败：${error.message}`);
    process.exitCode = 1;
  });

  if (await waitUntilReady()) {
    console.log(`[launcher] 工作台已启动：${appUrl}`);
    openBrowser(appUrl);
  } else {
    console.error('[launcher] 服务未能按时启动，请查看上方错误信息。');
  }
}

main().catch(error => {
  console.error(`[launcher] ${error.message}`);
  process.exitCode = 1;
});

#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { build: bundle } = require('esbuild');

const sourceDir = path.resolve(__dirname, '..');
const pkg = require(path.join(sourceDir, 'package.json'));
const releaseRoot = path.join(sourceDir, 'release');
const releaseName = `CommentConsole-${pkg.version}-Windows-x64`;
const outputDir = path.join(releaseRoot, releaseName);

function ensureSafeOutput(target) {
  const resolved = path.resolve(target);
  const expectedParent = `${path.resolve(releaseRoot)}${path.sep}`;
  if (!resolved.startsWith(expectedParent) || path.basename(resolved) !== releaseName) {
    throw new Error(`拒绝清理非预期目录：${resolved}`);
  }
}

function copy(relative) {
  const from = path.join(sourceDir, relative);
  const to = path.join(outputDir, relative);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true });
}

function write(relative, content) {
  const target = path.join(outputDir, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

async function build() {
  ensureSafeOutput(outputDir);
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });

  for (const item of [
    'server.js',
    'launcher.js',
    'cli.js',
    'package.json',
    'LICENSE',
    'DISCLAIMER.md',
    'README.md',
    'reply-strategy.md',
    '使用方法.txt',
    '启动评论工作台.cmd',
    'frontend',
    'lib',
    'prompts',
    'proto',
  ]) copy(item);

  // Ship the MCP entry point as a single ESM file so the portable build can
  // expose MCP without installing the SDK dependency tree on the user's PC.
  await bundle({
    entryPoints: [path.join(sourceDir, 'mcp', 'server.mjs')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    outfile: path.join(outputDir, 'mcp', 'server.mjs'),
  });

  // cmd.exe can misparse LF-only batch files. Always publish the launcher
  // with native Windows line endings.
  const launcherBatch = fs.readFileSync(path.join(sourceDir, '启动评论工作台.cmd'), 'utf8')
    .replace(/\r?\n/g, '\r\n');
  write('启动评论工作台.cmd', launcherBatch);

  fs.mkdirSync(path.join(outputDir, 'scripts'), { recursive: true });
  const userScript = fs.readFileSync(path.join(sourceDir, 'scripts', 'douyin.user.js'), 'utf8')
    .replace(/token:\s*'[^']*'/, "token: ''");
  write(path.join('scripts', 'douyin.user.js'), userScript);

  const cleanConfig = JSON.parse(fs.readFileSync(path.join(sourceDir, 'config.example.json'), 'utf8'));
  cleanConfig.bridge.token = '';
  cleanConfig.llm.api_key = '';
  cleanConfig.llm.mode = 'custom';
  if (cleanConfig.managed_service) cleanConfig.managed_service.access_token = '';
  write('config.json', `${JSON.stringify(cleanConfig, null, 2)}\n`);

  copy(path.join('node_modules', 'ws'));
  copy(path.join('node_modules', 'bindings', 'bindings.js'));
  copy(path.join('node_modules', 'bindings', 'package.json'));
  copy(path.join('node_modules', 'file-uri-to-path', 'index.js'));
  copy(path.join('node_modules', 'file-uri-to-path', 'package.json'));
  copy(path.join('node_modules', 'better-sqlite3', 'package.json'));
  copy(path.join('node_modules', 'better-sqlite3', 'lib'));
  copy(path.join('node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node'));

  const runtimeDir = path.join(outputDir, 'runtime');
  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.copyFileSync(process.execPath, path.join(runtimeDir, 'node.exe'));

  const version = process.version.replace(/^v/, '');
  const licenseUrl = `https://raw.githubusercontent.com/nodejs/node/v${version}/LICENSE`;
  try {
    const response = await fetch(licenseUrl, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    write(path.join('runtime', 'NODE-LICENSE.txt'), await response.text());
  } catch (error) {
    write(path.join('runtime', 'NODE-NOTICE.txt'), `Node.js ${process.version}\r\nLicense: ${licenseUrl}\r\n`);
    console.warn(`[build] Node.js license download failed: ${error.message}`);
  }

  for (const dir of ['storage', 'logs', 'downloads']) {
    fs.mkdirSync(path.join(outputDir, dir), { recursive: true });
    write(path.join(dir, '.keep'), '');
  }

  const manifest = {
    name: 'Comment Console',
    version: pkg.version,
    platform: 'win32-x64',
    node: process.version,
    builtAt: new Date().toISOString(),
  };
  write('版本信息.json', `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(outputDir);
}

build().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});

// lib/server/router.js — HTTP API 路由（/call, /status, /health）
//
// 认证：/api/call, /api/connect, /api/poll, /api/result 需要 token
//       /api/health, /api/status 公开（只读监控）
// CORS：仅允许 localhost 来源

const { randomUUID, randomBytes } = require('crypto');
const fs = require('fs');
const path = require('path');
const { validateCallRequest } = require('../shared/protocol');
const { safeSerialize } = require('../shared/serialize');
const { loadSettings, saveSettings } = require('../app/settings');
const { AppController } = require('../app/controller');

const FRONTEND_DIR = path.join(__dirname, '..', '..', 'frontend');

// 允许的 CORS 来源
const ALLOWED_ORIGINS = [
  'http://127.0.0.1',
  'http://localhost',
  'https://www.douyin.com',
  'https://douyin.com',
];

class Router {
  /**
   * @param {object} options
   * @param {import('./registry').ConnectionRegistry} options.registry
   * @param {import('./ws-hub').WebSocketHub} options.wsHub
   * @param {number} options.requestTimeout
   * @param {string} options.token - 访问令牌
   */
  constructor(options) {
    this.registry = options.registry;
    this.wsHub = options.wsHub;
    this.requestTimeout = options.requestTimeout || 30000;
    this.token = options.token || '';
    this.app = options.app || new AppController({
      config: options.config || null,
      hasConnection: () => this.registry.totalConnections > 0,
    });
    // HTTP 请求体上限（字节）。抖音搜索结果等大响应可能远超 1MB，
    // 默认 64MB，可用 config.json 的 bridge.maxBodySize 调整。
    this.maxBodySize = options.maxBodySize || 64 * 1024 * 1024;

    // 前端设置页使用 HttpOnly 会话 Cookie，不把 Bridge token 注入浏览器脚本。
    this._appSessions = new Map();

    /** @type {Map<string, { resolve: Function, reject: Function, timer: NodeJS.Timeout }>} */
    this._pending = new Map();

    // HTTP 轮询队列：site → [{ msgId, expression, awaitPromise }]
    this._pollQueue = new Map();
    // HTTP 轮询等待者：site → [{ res, timer }]
    this._pollWaiters = new Map();

    // 监听 ws-hub 的 result 事件
    this.wsHub.on('result', (msg) => {
      const pending = this._pending.get(msg.id);
      if (pending) {
        clearTimeout(pending.timer);
        this._pending.delete(msg.id);

        if (msg.error) {
          pending.reject(new Error(msg.error));
        } else {
          pending.resolve(msg.value);
        }
      }
    });
  }

  /**
   * 安全发送 JSON 响应（处理 BigInt 序列化）
   */
  _sendJson(res, statusCode, data) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(safeSerialize(data)));
  }

  /** 创建 App 任务；控制器同步拒绝（如未连接抖音）时返回 409 而不是 500。 */
  _startAppJob(res, createJob) {
    let job;
    try {
      job = createJob();
    } catch (error) {
      return this._sendJson(res, 409, { ok: false, error: error.message || '任务无法启动' });
    }
    return this._sendJson(res, 202, { ok: true, job: this.app.getJob(job.id) });
  }

  /**
   * 处理 HTTP 请求
   * @param {import('http').IncomingMessage} req
   * @param {import('http').ServerResponse} res
   */
  async handle(req, res) {
    // WebSocket 升级请求交给 ws-hub，router 不介入
    if (req.headers.upgrade && req.headers.upgrade.toLowerCase() === 'websocket') {
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const path = url.pathname;
    const method = req.method.toUpperCase();

    // CORS：仅允许已知来源（localhost + douyin.com）
    const origin = req.headers.origin || '';
    if (ALLOWED_ORIGINS.some(o => origin.startsWith(o)) || !origin) {
      res.setHeader('Access-Control-Allow-Origin', origin || '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
    }

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      // 本地设置页和静态资源。Bridge Server 默认只监听 127.0.0.1，
      // 这里再做一次本地来源限制，避免把管理界面暴露到局域网。
      if (path === '/app' || path === '/app/' || path.startsWith('/app/')) {
        return this._handleAppRequest(req, res, path, method);
      }
      if (path.startsWith('/api/app/')) {
        return await this._handleAppApi(req, res, path, method);
      }

      // 公开端点：无需认证
      if (method === 'GET' && path === '/api/health') {
        return this._health(res);
      }
      if (method === 'GET' && path === '/api/status') {
        return this._status(res);
      }

      // 受保护端点：需要 token 认证
      if (!this._authenticate(req, res)) return;

      if (method === 'POST' && path === '/api/call') {
        return await this._call(req, res);
      }
      if (method === 'POST' && path === '/api/connect') {
        return await this._connect(req, res);
      }
      if (method === 'GET' && path === '/api/poll') {
        return await this._poll(url, res);
      }
      if (method === 'POST' && path === '/api/result') {
        return await this._result(req, res);
      }

      // 404
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Not found' }));
    } catch (e) {
      console.error(`[router] Unhandled error: ${e.message}`);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    }
  }

  _isLocalRequest(req) {
    const remote = req.socket?.remoteAddress || '';
    return !remote || remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
  }

  _parseCookie(req, name) {
    const raw = req.headers?.cookie || '';
    const item = raw.split(';').map(s => s.trim()).find(s => s.startsWith(`${name}=`));
    return item ? decodeURIComponent(item.slice(name.length + 1)) : '';
  }

  _getOrCreateAppSession(req, res) {
    const existing = this._parseCookie(req, 'app_session');
    const now = Date.now();
    if (existing && this._appSessions.get(existing) > now) {
      return existing;
    }

    const session = randomBytes(24).toString('hex');
    this._appSessions.set(session, now + 4 * 60 * 60 * 1000);
    res.setHeader('Set-Cookie', `app_session=${encodeURIComponent(session)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=14400`);
    return session;
  }

  _isValidAppSession(req) {
    const session = this._parseCookie(req, 'app_session');
    const expiresAt = session ? this._appSessions.get(session) : 0;
    if (!expiresAt || expiresAt <= Date.now()) {
      if (session) this._appSessions.delete(session);
      return false;
    }
    return true;
  }

  _handleAppRequest(req, res, requestPath, method) {
    if (!this._isLocalRequest(req)) {
      return this._sendJson(res, 403, { ok: false, error: 'Frontend is local-only' });
    }
    if (method !== 'GET' && method !== 'HEAD') {
      return this._sendJson(res, 405, { ok: false, error: 'Method not allowed' });
    }

    this._getOrCreateAppSession(req, res);
    const relative = requestPath === '/app' || requestPath === '/app/'
      ? 'index.html'
      : requestPath.slice('/app/'.length);
    const allowed = new Set(['index.html', 'styles.css', 'app.js']);
    if (!allowed.has(relative)) {
      return this._sendJson(res, 404, { ok: false, error: 'Frontend asset not found' });
    }

    const filePath = path.join(FRONTEND_DIR, relative);
    let body;
    try {
      body = fs.readFileSync(filePath);
    } catch (_) {
      return this._sendJson(res, 404, { ok: false, error: 'Frontend is not installed' });
    }
    const mime = relative.endsWith('.html') ? 'text/html; charset=utf-8'
      : relative.endsWith('.css') ? 'text/css; charset=utf-8'
        : 'application/javascript; charset=utf-8';
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store' });
    if (method === 'HEAD') return res.end();
    res.end(body);
  }

  async _handleAppApi(req, res, requestPath, method) {
    if (!this._isLocalRequest(req)) {
      return this._sendJson(res, 403, { ok: false, error: 'Frontend API is local-only' });
    }
    if (!this._isValidAppSession(req)) {
      return this._sendJson(res, 401, { ok: false, error: 'App session expired; reload /app' });
    }

    let body = {};
    if (method !== 'GET') {
      body = await this._parseBody(req, res);
      if (body === null) return;
    }

    if (requestPath === '/api/app/settings' && method === 'GET') {
      return this._sendJson(res, 200, { ok: true, settings: loadSettings() });
    }
    if (requestPath === '/api/app/settings' && (method === 'POST' || method === 'PUT')) {
      const settings = saveSettings(body);
      return this._sendJson(res, 200, { ok: true, settings });
    }

    if (requestPath === '/api/app/overview' && method === 'GET') {
      return this._sendJson(res, 200, { ok: true, overview: this.app.getOverview() });
    }

    if (requestPath === '/api/app/videos' && method === 'GET') {
      return this._sendJson(res, 200, { ok: true, videos: this.app.listVideos() });
    }
    if (requestPath === '/api/app/videos/discover' && method === 'POST') {
      return this._startAppJob(res, () => this.app.discoverVideos(body));
    }
    if (requestPath === '/api/app/campaign/run' && method === 'POST') {
      return this._startAppJob(res, () => this.app.runCampaign(body));
    }
    if (requestPath === '/api/app/videos/resolve' && method === 'POST') {
      const video = await this.app.resolveVideoInput(body.input || body.url || body.aweme_id);
      return this._sendJson(res, 200, { ok: true, video });
    }

    const fetchMatch = requestPath.match(/^\/api\/app\/videos\/([^/]+)\/fetch$/);
    if (fetchMatch && method === 'POST') {
      const awemeId = decodeURIComponent(fetchMatch[1]);
      return this._startAppJob(res, () => this.app.fetchComments(awemeId, body));
    }

    if (requestPath === '/api/app/comments' && method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const comments = this.app.listComments(url.searchParams.get('aweme_id'), {
        replied: url.searchParams.get('replied'),
        query: url.searchParams.get('q'),
        limit: url.searchParams.get('limit'),
        intentMin: url.searchParams.get('intent_min'),
        hasIntent: url.searchParams.get('has_intent') === 'true',
        targetOnly: url.searchParams.get('target_only') === 'true',
      });
      return this._sendJson(res, 200, { ok: true, comments });
    }

    const replyMatch = requestPath.match(/^\/api\/app\/comments\/([^/]+)\/reply$/);
    if (replyMatch && method === 'POST') {
      const cid = decodeURIComponent(replyMatch[1]);
      return this._startAppJob(res, () => this.app.replyToComment(body.aweme_id || body.awemeId, cid, body.text));
    }

    const draftMatch = requestPath.match(/^\/api\/app\/comments\/([^/]+)\/draft$/);
    if (draftMatch && method === 'POST') {
      const cid = decodeURIComponent(draftMatch[1]);
      return this._startAppJob(res, () => this.app.draftReply(
        body.aweme_id || body.awemeId,
        cid,
        body,
      ));
    }

    const analyzeMatch = requestPath.match(/^\/api\/app\/videos\/([^/]+)\/analyze$/);
    if (analyzeMatch && method === 'POST') {
      const awemeId = decodeURIComponent(analyzeMatch[1]);
      return this._startAppJob(res, () => this.app.analyzeComments(awemeId, body));
    }

    const jobMatch = requestPath.match(/^\/api\/app\/jobs\/([^/]+)$/);
    if (jobMatch && method === 'GET') {
      const job = this.app.getJob(decodeURIComponent(jobMatch[1]));
      if (!job) return this._sendJson(res, 404, { ok: false, error: 'Job not found' });
      return this._sendJson(res, 200, { ok: true, job });
    }

    return this._sendJson(res, 404, { ok: false, error: 'App API not found' });
  }

  /**
   * Token 认证检查
   * 支持 Authorization: Bearer <token> 或 ?token=<token> 查询参数
   */
  _authenticate(req, res) {
    if (!this.token) return true; // 未配置 token 则跳过认证

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const authHeader = req.headers.authorization || '';
    const queryToken = url.searchParams.get('token') || '';

    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : queryToken;

    if (token !== this.token) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Unauthorized — 无效的 access token' }));
      return false;
    }
    return true;
  }

  _health(res) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      uptime: Math.floor(process.uptime()),
      version: '1.0.0',
      connections: this.registry.totalConnections,
    }));
  }

  _status(res) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      connections: this.registry.list(),
      totalConnections: this.registry.totalConnections,
      uptime: Math.floor(process.uptime()),
    }));
  }

  async _call(req, res) {
    // 解析 body
    const body = await this._parseBody(req, res);
    if (body === null) return;

    const result = validateCallRequest(body);
    if (!result.valid) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: result.error }));
      return;
    }

    const { site, expression, awaitPromise, connIndex, timeout } = result.data;
    const msgId = randomUUID();
    const effectiveTimeout = timeout || this.requestTimeout;

    // 方式1：WebSocket 路径
    const conn = this.registry.get(site, connIndex);
    if (conn && conn.ws) {
      const pendingPromise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          this._pending.delete(msgId);
          reject(new Error(`Request timeout after ${effectiveTimeout}ms`));
        }, effectiveTimeout);
        this._pending.set(msgId, { resolve, reject, timer });
      });

      try {
        this.wsHub.sendEval(conn, msgId, expression, awaitPromise);
      } catch (e) {
        const p = this._pending.get(msgId);
        if (p) { clearTimeout(p.timer); this._pending.delete(msgId); }
      }

      if (this._pending.has(msgId)) {
        try {
          const value = await pendingPromise;
          this._sendJson(res, 200, { ok: true, value, connection: conn.id });
          return;
        } catch (e) {
          // WS 超时，fallthrough 到 HTTP 轮询
        }
      }
    }

    // 方式2：HTTP 轮询 — 有等待中的 poll 请求
    const waiters = this._pollWaiters.get(site);
    if (waiters && waiters.length > 0) {
      const waiter = waiters.shift();
      if (waiters.length === 0) this._pollWaiters.delete(site);
      clearTimeout(waiter.timer);

      const pendingPromise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          this._pending.delete(msgId);
          reject(new Error(`Request timeout after ${effectiveTimeout}ms`));
        }, effectiveTimeout);
        this._pending.set(msgId, { resolve, reject, timer });
      });

      waiter.res.writeHead(200, { 'Content-Type': 'application/json' });
      waiter.res.end(JSON.stringify({ ok: true, type: 'eval', id: msgId, expression, awaitPromise }));

      try {
        const value = await pendingPromise;
        this._sendJson(res, 200, { ok: true, value, connection: 'polling' });
        return;
      } catch (e) {
        this._sendJson(res, 503, { ok: false, error: e.message });
        return;
      }
    }

    // 方式3：无等待者 → 放入队列，等 poll 来取
    if (!this._pollQueue.has(site)) this._pollQueue.set(site, []);
    this._pollQueue.get(site).push({ msgId, expression, awaitPromise });

    const pendingPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(msgId);
        const queue = this._pollQueue.get(site);
        if (queue) {
          const idx = queue.findIndex(c => c.msgId === msgId);
          if (idx !== -1) queue.splice(idx, 1);
        }
        reject(new Error(`Request timeout after ${effectiveTimeout}ms — no polling client connected`));
      }, effectiveTimeout);
      this._pending.set(msgId, { resolve, reject, timer });
    });

    try {
      const value = await pendingPromise;
      this._sendJson(res, 200, { ok: true, value, connection: 'polling-queued' });
    } catch (e) {
      this._sendJson(res, 503, { ok: false, error: e.message });
    }
  }

  // ── HTTP 轮询：注册 ──
  async _connect(req, res) {
    const body = await this._parseBody(req, res);
    if (body === null) return;
    const site = body.site;
    if (!site) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'site required' }));
      return;
    }
    if (!this._isMainDouyinUrl(body.url)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: '仅允许 www.douyin.com / douyin.com 主站页面注册' }));
      return;
    }
    // 清理僵尸连接：HTTP 轮询无 close 事件，页面刷新后旧连接无法自动清理
    // 每次新 connect 时删除同 site 的 ws===null 旧条目，防止累积重复
    this.registry.removeStalePolling(site);
    const meta = { url: body.url || '', title: body.title || '', userAgent: body.userAgent || '' };
    const conn = this.registry.register(site, null, meta);
    console.log(`[router] poll client: ${site} (${conn.id.slice(0, 8)})`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, id: conn.id }));
  }

  _isMainDouyinUrl(value) {
    if (!value) return true;
    try {
      const url = new URL(String(value));
      return url.hostname === 'www.douyin.com' || url.hostname === 'douyin.com';
    } catch (_) {
      return false;
    }
  }

  // ── HTTP 轮询：等待命令（长轮询）──
  async _poll(url, res) {
    const site = url.searchParams.get('site');
    if (!site) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'site required' }));
      return;
    }
    const connId = url.searchParams.get('id') || '';
    // 更新连接活跃时间（用于僵尸检测）
    if (connId) {
      this.registry.touch(connId);
    }

    // 队列中有待处理命令 → 立即返回
    const queue = this._pollQueue.get(site);
    if (queue && queue.length > 0) {
      const cmd = queue.shift();
      if (queue.length === 0) this._pollQueue.delete(site);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, type: 'eval', id: cmd.msgId, expression: cmd.expression, awaitPromise: cmd.awaitPromise }));
      return;
    }

    // 无命令 → 长轮询等待（25s 超时）
    const timer = setTimeout(() => {
      const waiters = this._pollWaiters.get(site);
      if (waiters) {
        const idx = waiters.findIndex(w => w.res === res);
        if (idx !== -1) waiters.splice(idx, 1);
        if (waiters.length === 0) this._pollWaiters.delete(site);
      }
      if (!res.headersSent) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, type: 'idle' }));
      }
    }, 25000);

    if (!this._pollWaiters.has(site)) this._pollWaiters.set(site, []);
    this._pollWaiters.get(site).push({ res, timer });

    res.on('close', () => {
      clearTimeout(timer);
      const waiters = this._pollWaiters.get(site);
      if (waiters) {
        const idx = waiters.findIndex(w => w.res === res);
        if (idx !== -1) waiters.splice(idx, 1);
        if (waiters.length === 0) this._pollWaiters.delete(site);
      }
    });
  }

  // ── HTTP 轮询：提交 eval 结果 ──
  async _result(req, res) {
    const body = await this._parseBody(req, res);
    if (body === null) return;
    const { id, value, error } = body;

    const pending = this._pending.get(id);
    if (pending) {
      clearTimeout(pending.timer);
      this._pending.delete(id);
      if (error) pending.reject(new Error(error));
      else pending.resolve(value);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  }

  /**
   * 读取并解析请求体。解析失败（超限/非法 JSON）时已写好错误响应，返回 null。
   * @param {import('http').IncomingMessage} req
   * @param {import('http').ServerResponse} res
   */
  async _parseBody(req, res) {
    try {
      return await this._readBody(req, res);
    } catch (e) {
      if (!res.headersSent) {
        const status = e.message === 'Request body too large' ? 413 : 400;
        this._sendJson(res, status, { ok: false, error: e.message });
      }
      return null;
    }
  }

  _readBody(req, res) {
    return new Promise((resolve, reject) => {
      let data = '';
      let rejected = false;
      req.on('data', chunk => {
        if (rejected) return;
        data += chunk;
        // 限制 body 大小（默认 64MB，可用 config.bridge.maxBodySize 调整）
        if (Buffer.byteLength(data) > this.maxBodySize) {
          rejected = true;
          // 返回 413 让客户端拿到明确错误，而不是直接掐断连接（ECONNRESET）
          if (res && !res.headersSent) {
            res.writeHead(413, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Request body too large' }));
          }
          req.resume(); // 排空剩余数据，保持 socket 可用
          reject(new Error('Request body too large'));
        }
      });
      req.on('end', () => {
        if (rejected) return;
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Invalid JSON in request body'));
        }
      });
      req.on('error', reject);
    });
  }
}

module.exports = { Router };

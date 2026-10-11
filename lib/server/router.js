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
const llmSettingsModule = require('../app/llm-settings');
const { AppController } = require('../app/controller');
const workflows = require('../app/workflows');
const { SITE } = require('../commands/helpers');
const usersMemory = require('../memory/users');
const commentsMemory = require('../memory/comments');
const dmMemory = require('../memory/dm');

const POLLING_HEARTBEAT_TTL_MS = 35000;

const FRONTEND_DIR = path.join(__dirname, '..', '..', 'frontend');
const USERSCRIPT_FILE = path.join(__dirname, '..', '..', 'scripts', 'douyin.user.js');

function accountLabelForApi(account = {}) {
  return account.nickname || (account.uid ? `账号 ${String(account.uid).slice(-6)}` : `抖音账号 ${Number(account.index || 0) + 1}`);
}

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
      hasConnection: () => this._healthyConnectionCount() > 0,
    });
    this.llmSettings = options.llmSettings || llmSettingsModule;
    // HTTP 请求体上限（字节）。抖音搜索结果等大响应可能远超 1MB，
    // 默认 64MB，可用 config.json 的 bridge.maxBodySize 调整。
    this.maxBodySize = options.maxBodySize || 64 * 1024 * 1024;

    // 前端设置页使用 HttpOnly 会话 Cookie，不把 Bridge token 注入浏览器脚本。
    this._appSessions = new Map();
    this._accountProbes = new Map();
    this._workflowTickRunning = false;
    this._workflowTimer = setInterval(() => this._tickWorkflows(), 60 * 1000);
    this._workflowTimer.unref?.();

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
    const allowed = new Set(['index.html', 'styles.css', 'app.js', 'douyin.user.js']);
    if (!allowed.has(relative)) {
      return this._sendJson(res, 404, { ok: false, error: 'Frontend asset not found' });
    }

    const filePath = relative === 'douyin.user.js' ? USERSCRIPT_FILE : path.join(FRONTEND_DIR, relative);
    let body;
    try {
      body = fs.readFileSync(filePath);
    } catch (_) {
      return this._sendJson(res, 404, { ok: false, error: 'Frontend is not installed' });
    }
    if (relative === 'douyin.user.js') {
      const source = body.toString('utf8');
      body = Buffer.from(source.replace(
        /token:\s*'[^']*'/,
        `token: '${String(this.token || '').replace(/['\\]/g, '')}'`,
      ), 'utf8');
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
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
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

    if (requestPath === '/api/app/llm/config' && method === 'GET') {
      return this._sendJson(res, 200, { ok: true, config: this.llmSettings.getPublicConfig() });
    }
    if (requestPath === '/api/app/llm/config' && (method === 'POST' || method === 'PUT')) {
      const saved = this.llmSettings.saveConfig(body);
      this.app.updateLlmConfig?.(saved.internal);
      return this._sendJson(res, 200, { ok: true, config: saved.public });
    }
    if (requestPath === '/api/app/llm/models' && method === 'POST') {
      const result = await this.llmSettings.fetchModels(body);
      return this._sendJson(res, 200, { ok: true, ...result });
    }
    if (requestPath === '/api/app/llm/test' && method === 'POST') {
      const result = await this.llmSettings.testConnection(body);
      // 测试通过后立即保存并应用“刚刚实际测试”的同一套配置，避免测试用
      // model-a、正式任务却继续用旧 model-b 的隐蔽配置漂移。
      let appliedConfig = null;
      if (body.apply === true) {
        const saved = this.llmSettings.saveConfig(body);
        this.app.updateLlmConfig?.(saved.internal);
        appliedConfig = saved.public;
      }
      return this._sendJson(res, 200, { ok: true, ...result, applied: !!appliedConfig, config: appliedConfig });
    }

    if (requestPath === '/api/app/overview' && method === 'GET') {
      return this._sendJson(res, 200, { ok: true, overview: this.app.getOverview() });
    }
    if (requestPath === '/api/app/accounts' && method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const accounts = await this._listAppAccounts(url.searchParams.get('probe') === '1');
      return this._sendJson(res, 200, { ok: true, accounts });
    }
    if (requestPath === '/api/app/workflows' && method === 'GET') {
      return this._sendJson(res, 200, { ok: true, workflows: workflows.list() });
    }
    if (requestPath === '/api/app/workflows' && (method === 'POST' || method === 'PUT')) {
      try {
        const created = method === 'POST' ? workflows.create(body) : workflows.update(body.id, body);
        return this._sendJson(res, method === 'POST' ? 201 : 200, { ok: true, workflow: created });
      } catch (error) {
        return this._sendJson(res, 400, { ok: false, error: error.message || '工作流配置无效' });
      }
    }
    if (requestPath === '/api/app/inbox' && method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const accountId = url.searchParams.get('account_id') || '';
      const inbox = await this._listAppInbox(accountId);
      return this._sendJson(res, 200, { ok: true, ...inbox });
    }
    if (requestPath === '/api/app/inbox/send' && method === 'POST') {
      const text = String(body.text || '').trim();
      const peerUid = String(body.peer_uid || body.peerUid || body.uid || '').trim();
      if (!text) return this._sendJson(res, 400, { ok: false, error: '私信内容不能为空' });
      if (!peerUid) return this._sendJson(res, 400, { ok: false, error: '缺少私信对象 UID' });
      const accounts = await this._listAppAccounts(true);
      const requested = String(body.account_id || body.accountId || '');
      const account = accounts.find(item => !requested || item.id === requested || item.accountId === requested);
      if (!account) return this._sendJson(res, 409, { ok: false, error: '没有找到可用的抖音账号，请先保持对应标签页在线并刷新账号池' });
      if (account.authenticated === false) return this._sendJson(res, 409, { ok: false, error: `${accountLabelForApi(account)} 尚未登录抖音` });
      return this._startAppJob(res, () => this.app.sendDM({
        connIndex: account.index,
        accountId: account.uid || account.id,
        accountUid: account.uid,
        accountNickname: account.nickname,
        peerUid,
        peerNickname: body.peer_nickname || body.peerNickname || '',
        conversationId: body.conversation_id || body.conversationId || '',
        text,
      }));
    }
    if (requestPath === '/api/app/inbox/read' && method === 'POST') {
      const conversationId = String(body.conversation_id || body.conversationId || '').trim();
      const accountId = String(body.account_id || body.accountId || '').trim();
      if (!conversationId || !accountId) return this._sendJson(res, 400, { ok: false, error: '缺少会话标识' });
      dmMemory.markRead(conversationId, accountId);
      return this._sendJson(res, 200, { ok: true });
    }
    if (requestPath === '/api/app/douyin/session' && method === 'GET') {
      const session = await this.app.checkDouyinSession();
      return this._sendJson(res, 200, { ok: true, session });
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
        hasDraft: url.searchParams.get('has_draft') === 'true',
        targetOnly: url.searchParams.get('target_only') === 'true',
      });
      return this._sendJson(res, 200, { ok: true, comments });
    }

    const replyMatch = requestPath.match(/^\/api\/app\/comments\/([^/]+)\/reply$/);
    if (replyMatch && method === 'POST') {
      const cid = decodeURIComponent(replyMatch[1]);
      return this._startAppJob(res, () => this.app.replyToComment(
        body.aweme_id || body.awemeId,
        cid,
        body.text,
        { connIndex: body.connIndex ?? body.accountIndex },
      ));
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

    if (requestPath === '/api/app/jobs' && method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const jobs = this.app.listJobs({
        limit: url.searchParams.get('limit'),
        status: url.searchParams.get('status') || undefined,
        type: url.searchParams.get('type') || undefined,
      });
      return this._sendJson(res, 200, { ok: true, jobs });
    }

    const jobMatch = requestPath.match(/^\/api\/app\/jobs\/([^/]+)$/);
    if (jobMatch && method === 'GET') {
      const job = this.app.getJob(decodeURIComponent(jobMatch[1]));
      if (!job) return this._sendJson(res, 404, { ok: false, error: 'Job not found' });
      return this._sendJson(res, 200, { ok: true, job });
    }

    const workflowMatch = requestPath.match(/^\/api\/app\/workflows\/([^/]+)(?:\/(toggle|run))?$/);
    if (workflowMatch && (method === 'PUT' || method === 'POST' || method === 'DELETE')) {
      const workflowId = decodeURIComponent(workflowMatch[1]);
      const action = workflowMatch[2] || '';
      try {
        if (method === 'DELETE') {
          if (!workflows.remove(workflowId)) return this._sendJson(res, 404, { ok: false, error: '工作流不存在' });
          return this._sendJson(res, 200, { ok: true });
        }
        if (action === 'toggle') {
          const workflow = workflows.toggle(workflowId, body.active !== false);
          return this._sendJson(res, 200, { ok: true, workflow });
        }
        if (action === 'run') {
          const workflow = workflows.get(workflowId);
          if (!workflow) return this._sendJson(res, 404, { ok: false, error: '工作流不存在' });
          if (!this.app.runCampaign) return this._sendJson(res, 501, { ok: false, error: '当前运行器不支持工作流执行' });
          const accountIndexes = await this._resolveWorkflowAccountIndexes(workflow);
          const boundAccounts = await this._listAppAccounts(false);
          const jobs = accountIndexes.map(accountIndex => this.app.runCampaign({
            keyword: workflow.searchKeywords[0],
            manualKeywords: workflow.searchKeywords.slice(1),
            commentKeywords: workflow.commentKeywords,
            replyText: workflow.actions.comment ? workflow.commentTemplate : '',
            dmText: workflow.actions.dm ? workflow.dmTemplate : '',
            dmLimit: workflow.limits?.dmsPerAccount,
            actions: workflow.actions,
            deliveryMode: workflow.requireApproval ? 'draft' : workflow.replyMode,
            connIndex: accountIndex,
            accountId: boundAccounts.find(account => account.index === accountIndex)?.uid
              || boundAccounts.find(account => account.index === accountIndex)?.id,
            accountUid: boundAccounts.find(account => account.index === accountIndex)?.uid || '',
            accountNickname: boundAccounts.find(account => account.index === accountIndex)?.nickname || '',
            keywordExpandEnabled: false,
          }));
          try { workflows.recordRun(workflow.id, { lastJobId: jobs[0]?.id || null, lastJobIds: jobs.map(job => job.id), lastError: null }); } catch (_) { /* 任务已经启动，统计写入失败不阻断执行 */ }
          return this._sendJson(res, 202, {
            ok: true,
            job: jobs[0] ? this.app.getJob(jobs[0].id) : null,
            jobs: jobs.map(job => this.app.getJob(job.id)),
            workflow: workflows.get(workflow.id),
          });
        }
        const updated = workflows.update(workflowId, body);
        return this._sendJson(res, 200, { ok: true, workflow: updated });
      } catch (error) {
        return this._sendJson(res, 400, { ok: false, error: error.message || '工作流操作失败' });
      }
    }

    return this._sendJson(res, 404, { ok: false, error: 'App API not found' });
  }

  /** 返回当前连接的账号池。一个浏览器标签页就是一个独立账号槽位。 */
  async _listAppAccounts(probe = false) {
    this.registry.removeExpiredPolling?.(POLLING_HEARTBEAT_TTL_MS);
    const snapshots = this.registry.list({ pollingTtlMs: POLLING_HEARTBEAT_TTL_MS })[SITE] || [];
    const all = this.registry.getAll(SITE);
    const aliveById = new Map(snapshots.map(item => [item.id, item]));
    // registry.get(site, index) 的 index 在存在 WebSocket 时只遍历 WS，保持账号
    // 卡片的 index 与实际命令路由一致。
    const target = all.filter(conn => conn.ws && conn.ws.readyState === 1);
    const ordered = (target.length ? target : all).filter(conn => aliveById.get(conn.id)?.alive !== false);
    const accounts = [];
    for (let index = 0; index < ordered.length; index += 1) {
      const conn = ordered[index];
      const snapshot = aliveById.get(conn.id) || {};
      let session = this._accountProbes.get(conn.id)?.value || null;
      const cachedAt = this._accountProbes.get(conn.id)?.at || 0;
      if (probe && this.app.checkDouyinSession && Date.now() - cachedAt > 15000) {
        try {
          session = await this.app.checkDouyinSession({ connIndex: index });
          this._accountProbes.set(conn.id, { at: Date.now(), value: session });
        } catch (error) {
          session = { connected: true, authenticated: false, message: error.message || '账号状态读取失败' };
          this._accountProbes.set(conn.id, { at: Date.now(), value: session });
        }
      }
      accounts.push({
        id: conn.id,
        accountId: session?.uid || conn.id,
        index,
        platform: SITE,
        nickname: session?.nickname || '',
        uid: session?.uid || '',
        authenticated: session?.authenticated ?? null,
        status: snapshot.alive === false ? 'offline' : session?.authenticated === false ? 'login_required' : 'online',
        statusMessage: session?.message || '',
        // title 是给前端显示的账号名，不能再退回浏览器标签页标题（例如“抖音精选电脑版”）。
        title: accountLabelForApi({ nickname: session?.nickname || '', uid: session?.uid || '', index }),
        browserTitle: conn.title || '',
        url: conn.url || '',
        transport: snapshot.transport || (conn.ws ? 'websocket' : 'polling'),
        connectedAt: conn.connectedAt,
        lastActivity: conn.lastActivity,
        alive: snapshot.alive !== false,
      });
    }
    return accounts;
  }

  async _resolveWorkflowAccountIndex(workflow) {
    const indexes = await this._resolveWorkflowAccountIndexes(workflow);
    return indexes[0] ?? 0;
  }

  async _resolveWorkflowAccountIndexes(workflow) {
    const accounts = await this._listAppAccounts(false);
    const selected = [];
    for (const id of workflow.accountIds || []) {
      const match = accounts.find(account => account.id === id || account.accountId === id);
      if (match && !selected.includes(match.index)) selected.push(match.index);
    }
    for (const raw of workflow.accountIndexes || []) {
      const index = Number(raw);
      if (Number.isInteger(index) && index >= 0 && index < accounts.length && !selected.includes(index)) selected.push(index);
    }
    return selected.length ? selected : (accounts.length ? [accounts[0].index] : [0]);
  }

  async _listAppInbox(accountId = '') {
    // 收件箱刷新时主动探测一次资料，确保账号名来自抖音 user_info，而不是浏览器标签标题。
    const accounts = await this._listAppAccounts(true);
    const selected = accountId
      ? accounts.filter(account => account.id === accountId || account.accountId === accountId)
      : accounts;
    const messages = [];
    if (this.app.listDMs) {
      for (const account of selected) {
        try {
          const storeAccountId = account.uid || account.id;
          const rows = await this.app.listDMs({
            connIndex: account.index,
            accountId: storeAccountId,
            accountUid: account.uid,
            accountNickname: account.nickname,
          });
          for (const item of rows || []) {
            if (item?.type !== 'system') messages.push({ ...item, accountId: storeAccountId, accountName: account.nickname || `账号 ${String(account.uid || account.id).slice(-6)}` });
          }
        } catch (error) {
          messages.push({ type: 'system', status: 'unavailable', accountId: account.id, message: error.message });
        }
      }
    }
    // 无匹配账号时必须返回空会话，不能因为 accountIds 为空而把其他账号的历史私信混进来。
    const storeAccountIds = selected.length
      ? selected.map(account => account.uid || account.id)
      : (accountId ? ['__no_such_account__'] : []);
    const rawConversations = dmMemory.listConversations({ accountIds: storeAccountIds, limit: 100, messageLimit: 200 });
    const conversations = rawConversations.map(conversation => {
      const user = conversation.peerUid ? usersMemory.get(conversation.peerUid) : null;
      const account = accounts.find(item => (item.uid || item.id) === conversation.accountId);
      return {
        ...conversation,
        uid: conversation.peerUid,
        nickname: conversation.peerNickname || user?.nickname || `用户 ${String(conversation.peerUid || '').slice(0, 8)}`,
        accountName: account?.nickname || `账号 ${String(account?.uid || account?.id || conversation.accountId).slice(-6)}`,
        accountLabel: account?.nickname || account?.uid || account?.id || conversation.accountId,
        tier: user?.tier || null,
        replyCount: user?.replyCount || 0,
        tags: user?.tags || [],
        evidenceComments: conversation.peerUid ? commentsMemory.listByUid(conversation.peerUid, { limit: 5 }) : [],
      };
    });
    return { accounts, messages, conversations, unreadCount: dmMemory.countUnread(), updatedAt: Date.now() };
  }

  /** 每分钟检查一次启用的定时工作流。审核模式只会生成草稿，发布模式仍受用户的
   * 明确开关和每账号额度约束；服务重启后不会补跑积压任务。 */
  async _tickWorkflows() {
    if (this._workflowTickRunning) return;
    this._workflowTickRunning = true;
    try {
      const now = Date.now();
      const accounts = await this._listAppAccounts(false);
      if (!accounts.length || !this.app.runCampaign) return;
      for (const workflow of workflows.list({ status: 'active' })) {
        if (workflow.trigger !== 'schedule') continue;
        const lastRun = Number(workflow.stats?.lastRunAt || 0);
        if (lastRun && now - lastRun < Number(workflow.scheduleMinutes || 30) * 60 * 1000) continue;
        const lastJobIds = Array.isArray(workflow.stats?.lastJobIds) && workflow.stats.lastJobIds.length
          ? workflow.stats.lastJobIds
          : (workflow.stats?.lastJobId ? [workflow.stats.lastJobId] : []);
        const hasRunningJob = this.app.getJob && lastJobIds.some(id => {
          const job = this.app.getJob(id);
          return job && (job.status === 'queued' || job.status === 'running');
        });
        if (hasRunningJob) continue;
        try {
          const accountIndexes = await this._resolveWorkflowAccountIndexes(workflow);
          const jobs = accountIndexes.map(accountIndex => this.app.runCampaign({
            keyword: workflow.searchKeywords[0],
            manualKeywords: workflow.searchKeywords.slice(1),
            commentKeywords: workflow.commentKeywords,
            replyText: workflow.actions.comment ? workflow.commentTemplate : '',
            dmText: workflow.actions.dm ? workflow.dmTemplate : '',
            dmLimit: workflow.limits?.dmsPerAccount,
            actions: workflow.actions,
            deliveryMode: workflow.requireApproval ? 'draft' : workflow.replyMode,
            connIndex: accountIndex,
            accountId: accounts.find(account => account.index === accountIndex)?.uid
              || accounts.find(account => account.index === accountIndex)?.id,
            accountUid: accounts.find(account => account.index === accountIndex)?.uid || '',
            accountNickname: accounts.find(account => account.index === accountIndex)?.nickname || '',
            keywordExpandEnabled: false,
          }));
          workflows.recordRun(workflow.id, { lastJobId: jobs[0]?.id || null, lastJobIds: jobs.map(job => job.id), lastError: null });
        } catch (error) {
          try { workflows.recordRun(workflow.id, { lastError: error.message || '自动运行失败' }); } catch (_) {}
        }
      }
    } catch (_) {
      // 自动巡检是增强能力，连接或本地存储暂时不可用时下一分钟再试。
    } finally {
      this._workflowTickRunning = false;
    }
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
    const connections = this._healthyConnectionCount();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      uptime: Math.floor(process.uptime()),
      version: '1.0.0',
      connections,
    }));
  }

  _status(res) {
    this.registry.removeExpiredPolling?.(POLLING_HEARTBEAT_TTL_MS);
    const connections = this.registry.list({ pollingTtlMs: POLLING_HEARTBEAT_TTL_MS });
    const totalConnections = this._healthyConnectionCount();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      connections,
      totalConnections,
      registeredConnections: this.registry.totalConnections,
      bridgeHealth: totalConnections > 0 ? 'healthy' : 'offline',
      heartbeatTtlMs: POLLING_HEARTBEAT_TTL_MS,
      uptime: Math.floor(process.uptime()),
    }));
  }

  _healthyConnectionCount() {
    return typeof this.registry.healthyCount === 'function'
      ? this.registry.healthyCount({ pollingTtlMs: POLLING_HEARTBEAT_TTL_MS })
      : this.registry.totalConnections;
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

    // 方式2：HTTP 轮询 — 有等待中的 poll 请求。
    // 每个标签页都有自己的 connId；有 connId 时按连接精确路由，避免多账号
    // 同时在线时把 A 账号的搜索/私信命令发到 B 账号。
    const pollKey = conn && !conn.ws ? `${site}::${conn.id}` : site;
    const waiters = this._pollWaiters.get(pollKey) || (pollKey === site ? null : this._pollWaiters.get(site));
    const activeWaiterKey = waiters && this._pollWaiters.get(pollKey) === waiters ? pollKey : site;
    if (waiters && waiters.length > 0) {
      const waiter = waiters.shift();
      if (waiters.length === 0) this._pollWaiters.delete(activeWaiterKey);
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
    if (!this._pollQueue.has(pollKey)) this._pollQueue.set(pollKey, []);
    this._pollQueue.get(pollKey).push({ msgId, expression, awaitPromise, connId: conn?.id || null });

    const pendingPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(msgId);
        const queue = this._pollQueue.get(pollKey);
        if (queue) {
          const idx = queue.findIndex(c => c.msgId === msgId);
          if (idx !== -1) queue.splice(idx, 1);
          if (queue.length === 0) this._pollQueue.delete(pollKey);
        }
        reject(new Error(`Request timeout after ${effectiveTimeout}ms — no polling client connected`));
      }, effectiveTimeout);
      this._pending.set(msgId, { resolve, reject, timer });
    });

    try {
      const value = await pendingPromise;
      this._sendJson(res, 200, { ok: true, value, connection: 'polling-queued' });
    } catch (e) {
      // 如果整个等待周期内都没有轮询客户端取走命令，立即清理过期注册记录，
      // 让前端下一次 3 秒心跳显示真实离线，而不是继续“假在线”。
      if (/no polling client connected/i.test(e.message)) {
        this.registry.removeExpiredPolling?.(POLLING_HEARTBEAT_TTL_MS);
      }
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
    // 只清理真正超过心跳期限的轮询记录。不同抖音标签页可能同时在线，
    // 不能因为其中一个重新注册就误删另一个仍在长轮询的客户端。
    this.registry.removeExpiredPolling?.(POLLING_HEARTBEAT_TTL_MS);
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

    // 队列中有待处理命令 → 立即返回。connId 能命中注册表时只消费该标签页
    // 的队列；旧版客户端没有可识别的 id 时仍兼容站点级队列。
    const exactKey = connId && this.registry.getById?.(connId)
      ? `${site}::${connId}`
      : site;
    const queueKey = this._pollQueue.has(exactKey) ? exactKey : site;
    const queue = this._pollQueue.get(queueKey);
    if (queue && queue.length > 0) {
      const cmd = queue.shift();
      if (queue.length === 0) this._pollQueue.delete(queueKey);
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

    const waiterKey = connId && this.registry.getById?.(connId) ? `${site}::${connId}` : site;
    if (!this._pollWaiters.has(waiterKey)) this._pollWaiters.set(waiterKey, []);
    this._pollWaiters.get(waiterKey).push({ res, timer });

    res.on('close', () => {
      clearTimeout(timer);
      const waiters = this._pollWaiters.get(waiterKey);
      if (waiters) {
        const idx = waiters.findIndex(w => w.res === res);
        if (idx !== -1) waiters.splice(idx, 1);
        if (waiters.length === 0) this._pollWaiters.delete(waiterKey);
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

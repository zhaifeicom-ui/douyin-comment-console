// lib/app/controller.js — 前端工作台的本地业务控制器
//
// 这个模块只在 Bridge Server 进程内运行。它把 CLI 命令层（search/get/post）
// 包装成适合 /api/app/* 使用的异步任务，前端只拿任务进度和已脱敏的结果。

const crypto = require('crypto');
const { AuditLogger } = require('../audit');
const { BridgeClient } = require('../client/bridge-client');
const commands = require('../commands');
const { SITE } = require('../commands/helpers');
const videos = require('../memory/videos');
const comments = require('../memory/comments');
const settingsModule = require('./settings');
const {
  buildIntentPrompt,
  buildReplyPrompt,
  normalizeIntentResult,
  normalizeReplyResult,
} = require('./lead-prompts');

const MAX_JOBS = 200;
const JOB_TTL_MS = 30 * 60 * 1000;

function clampInteger(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isInteger(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function loadConfig() {
  try {
    return require('../../config.json');
  } catch (_) {
    return {};
  }
}

function createCommandContext(config = {}) {
  const cfg = config && config.bridge ? config : loadConfig();
  const bridge = new BridgeClient({
    host: cfg.bridge?.host || '127.0.0.1',
    port: cfg.bridge?.port || 19422,
    token: cfg.bridge?.token || '',
  });
  const audit = new AuditLogger();

  async function bridgeCall(expression, awaitPromise = true) {
    const resp = await bridge.call({ site: SITE, expression, awaitPromise });
    if (resp.ok) return resp.value;
    throw new Error(resp.error || 'Bridge Server 返回未知错误');
  }

  async function loggedCall(endpoint, params, expression) {
    const startedAt = Date.now();
    try {
      const result = await bridgeCall(expression);
      const ms = Date.now() - startedAt;
      const summary = {};
      if (result) {
        if (result.comments) summary.count = result.comments.length;
        if (result.has_more !== undefined) summary.has_more = result.has_more;
        if (result.aweme_list) summary.count = result.aweme_list.length;
        if (result.data) summary.count = (result.data || []).filter(d => d.aweme_info).length;
        if (result.comment) {
          summary.cid = result.comment.cid;
          summary.status_code = 0;
        }
        if (result.status_code !== undefined && summary.status_code === undefined) {
          summary.status_code = result.status_code;
        }
      }
      audit.logApiCall(endpoint, params, ms, 'success', summary);
      return result;
    } catch (error) {
      audit.logApiCall(endpoint, params, Date.now() - startedAt, 'error', { error: error.message });
      throw error;
    }
  }

  const ctx = {
    bridge,
    audit,
    config: cfg,
    bridgeCall,
    loggedCall,
    cmdGet: null,
    cmdPost: null,
    cmdSearch: null,
  };
  ctx.cmdGet = args => commands.get(ctx, args);
  ctx.cmdPost = args => commands.post(ctx, args);
  ctx.cmdSearch = args => commands.search(ctx, args);
  return { ctx, bridge, audit, config: cfg };
}

function normalizeSearchItem(item) {
  const awemeId = item.aweme_id || item.awemeId;
  if (!awemeId) return null;
  return {
    awemeId: String(awemeId),
    title: item.desc || item.title || '',
    authorNickname: item.author?.nickname || item.authorNickname || '',
    authorUid: item.author?.uid || item.uid || item.authorUid || '',
    createTime: item.time || item.create_time || item.createTime || 0,
    stats: {
      playCount: item.plays || item.stats?.playCount || 0,
    },
  };
}

function normalizeStoredVideo(item) {
  return {
    awemeId: item.awemeId,
    title: item.title || '',
    authorUid: item.authorUid || '',
    isMine: !!item.isMine,
    totalCommentsSeen: item.totalCommentsSeen || 0,
    lastGetTs: item.lastGetTs || null,
    lastPostTs: item.lastPostTs || null,
  };
}

/** 把命令层 formatComment 的输出归一成前端可直接渲染的形状。 */
function normalizeCampaignComment(item) {
  return {
    cid: String(item.cid || ''),
    text: String(item.text || '').trim(),
    likes: Number(item.likes || item.digg || 0),
    time: Number(item.time || item.createdAt || 0),
    user: item.user ? {
      nickname: item.user.nickname || '',
      uid: item.user.uid || '',
    } : null,
  };
}

class AppController {
  /**
   * @param {object} options
   * @param {object} [options.config] 注入配置；不传则运行时读取 config.json
   * @param {object} [options.ctx] 测试可注入命令上下文
   */
  constructor(options = {}) {
    this._config = options.config || null;
    this._ctx = options.ctx || null;
    this._llm = options.llm || null;
    this._settings = options.settings || settingsModule;
    this._hasConnection = typeof options.hasConnection === 'function'
      ? options.hasConnection
      : () => true;
    this._jobs = new Map();
    this._pruneTimer = setInterval(() => this._pruneJobs(), 60 * 1000);
    this._pruneTimer.unref?.();
  }

  _ensureContext() {
    if (this._ctx) return;
    const built = createCommandContext(this._config || undefined);
    this._ctx = built.ctx;
    this._config = built.config;
  }

  _requireConnection() {
    if (!this._hasConnection()) {
      throw new Error('抖音尚未连接：请先在浏览器打开 www.douyin.com 主站并确认右上角显示“抖音已连接”');
    }
  }

  _getLlm() {
    if (this._llm) return this._llm;
    const { LLMClient } = require('../llm');
    const config = this._config || loadConfig();
    this._llm = new LLMClient(config.llm || {});
    return this._llm;
  }

  _loadSettings() {
    return this._settings.loadSettings();
  }

  _storedVideoContext(awemeId) {
    const stored = videos.get(awemeId) || {};
    return {
      awemeId: String(awemeId),
      title: stored.title || '',
      desc: stored.title || '',
      authorNickname: '',
      briefing: '',
      mode: 'text-only',
      screenshotB64: [],
    };
  }

  async _loadWorkflowVideoContext(awemeId, mode = 'text-only', screenshotCount = 4) {
    this._ensureContext();
    const fallback = this._storedVideoContext(awemeId);
    try {
      const { loadVideoContext } = require('../reply-engine/video-context');
      return await loadVideoContext(this._ctx.bridgeCall, awemeId, {
        mode: mode === 'screenshots' ? 'screenshots' : 'text-only',
        screenshotCount,
      });
    } catch (error) {
      // 视频详情或 ffmpeg 不可用时仍允许文本线索分析，避免整条工作流中断。
      return { ...fallback, contextWarning: error.message || '视频内容读取失败' };
    }
  }

  /**
   * 对某个视频的评论做目标客户判定。默认只生成分析结果，不发布任何内容。
   */
  analyzeComments(awemeId, input = {}) {
    const id = String(awemeId || '').trim();
    if (!/^\d{10,}$/.test(id)) throw new Error('无效的 aweme_id');
    this._requireConnection();

    const settings = this._loadSettings();
    if (settings.aiIntentEnabled === false && input.force !== true) {
      throw new Error('设置中已关闭 AI 意向判定，请先开启后再分析');
    }
    const threshold = clampInteger(
      input.intentThreshold ?? settings.intentThreshold,
      0,
      100,
      settings.intentThreshold || 65,
    );
    const mode = input.mode === 'screenshots' || settings.intentAnalysisMode === 'screenshots'
      ? 'screenshots'
      : 'text-only';
    const maxComments = clampInteger(
      input.maxComments ?? settings.maxCommentsPerVideo,
      1,
      10000,
      settings.maxCommentsPerVideo || 200,
    );

    return this._runJob('comments:analyze', {
      awemeId: id,
      intentThreshold: threshold,
      mode,
      maxComments,
    }, async ({ update }) => {
      this._ensureContext();
      let items = comments.listByVideoDetailed(id, { limit: maxComments });
      if (items.length === 0) {
        update(8, '还没有本地评论，先抓取候选评论');
        const fetched = await this._fetchComments(id, maxComments);
        items = comments.listByVideoDetailed(id, { limit: maxComments });
        if (items.length === 0) items = fetched.map(normalizeCampaignComment);
      }
      if (items.length === 0) {
        return {
          awemeId: id,
          targetCustomer: settings.targetCustomer || '',
          threshold,
          analyzedCount: 0,
          highIntentCount: 0,
          results: [],
          warnings: ['没有可供分析的评论'],
        };
      }

      update(18, '正在读取视频内容与上下文');
      const video = await this._loadWorkflowVideoContext(id, mode, input.screenshotCount || 4);
      const prompt = buildIntentPrompt({
        targetCustomer: input.targetCustomer || settings.targetCustomer,
        video,
        comments: items,
        threshold,
        images: video.screenshotB64,
      });

      update(35, `AI 正在判定 ${items.length} 条评论的客户意向`);
      const llm = this._getLlm();
      const raw = await llm.complete([
        { role: 'system', content: prompt.systemPrompt },
        { role: 'user', content: prompt.userPrompt },
      ], 0.15, { images: prompt.images });
      const parsed = llm.extractJSON(raw);
      const list = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.results) ? parsed.results
          : Array.isArray(parsed?.items) ? parsed.items : [];
      const byCid = new Map(list.map(item => [String(item?.cid || ''), item]));
      const results = items.map((comment) => {
        const normalized = normalizeIntentResult(byCid.get(String(comment.cid)) || {}, comment.cid, threshold);
        comments.setAnalysis(comment.cid, {
          sentiment: normalized.sentiment,
          priority: normalized.priority,
          isTarget: normalized.isTarget,
          intentScore: normalized.intentScore,
          intentLabel: normalized.intentLabel,
          intentStage: normalized.intentStage,
          intentReason: normalized.intentReason,
        });
        return { ...comment, ...normalized };
      });

      const warnings = [];
      if (video.contextWarning) warnings.push(`视频内容读取失败，已使用标题和评论文本：${video.contextWarning}`);
      update(95, '正在整理线索结果');
      return {
        awemeId: id,
        targetCustomer: input.targetCustomer || settings.targetCustomer || '',
        threshold,
        mode: video.mode || mode,
        analyzedCount: results.length,
        highIntentCount: results.filter(item => item.intentScore >= threshold && item.isTarget).length,
        warnings,
        video: {
          title: video.title || this._storedVideoContext(id).title,
          authorNickname: video.author?.nickname || video.authorNickname || '',
          coverUrl: video.coverUrl || null,
          briefing: video.briefing || '',
        },
        results,
      };
    });
  }

  /** 生成单条评论的回复草稿；只写入草稿，不执行发布。 */
  draftReply(awemeId, cid, input = {}) {
    const id = String(awemeId || '').trim();
    const commentId = String(cid || '').trim();
    if (!/^\d{10,}$/.test(id)) throw new Error('无效的 aweme_id');
    if (!commentId) throw new Error('缺少评论 cid');
    this._requireConnection();

    const settings = this._loadSettings();
    return this._runJob('comment:draft', { awemeId: id, cid: commentId }, async ({ update }) => {
      this._ensureContext();
      let comment = comments.get(commentId);
      if (!comment) {
        comment = comments.listByVideoDetailed(id, { limit: 10000 }).find(item => item.cid === commentId);
      }
      if (!comment) throw new Error('本地找不到这条评论，请先抓取评论');

      update(20, '正在读取视频上下文');
      const video = await this._loadWorkflowVideoContext(id, 'text-only');
      const prompt = buildReplyPrompt({
        targetCustomer: input.targetCustomer || settings.targetCustomer,
        video,
        comment,
        analysis: comment,
        tone: input.replyTone || settings.replyTone,
        cta: input.replyCta || settings.replyCta,
      });
      update(45, 'AI 正在生成针对性回复草稿');
      const llm = this._getLlm();
      const raw = await llm.complete([
        { role: 'system', content: prompt.systemPrompt },
        { role: 'user', content: prompt.userPrompt },
      ], 0.55, { images: prompt.images });
      const parsed = llm.extractJSON(raw);
      const candidate = Array.isArray(parsed) ? parsed[0] : parsed;
      const draft = normalizeReplyResult(candidate || {});
      if (!draft.reply) throw new Error('AI 没有生成有效回复，请重试或手动填写');
      comments.setAnalysis(commentId, { replyDraft: draft.reply });
      update(95, '回复草稿已生成，等待人工审核');
      return {
        awemeId: id,
        cid: commentId,
        reply: draft.reply,
        goal: draft.goal,
        risk: draft.risk,
        requiresApproval: true,
      };
    });
  }

  getOverview() {
    const settings = this._loadSettings();
    const threshold = settings.intentThreshold || 65;
    return {
      videos: videos.count(),
      comments: comments.count(),
      pendingReplies: comments.count({ replied: false }),
      analyzedComments: comments.count({ hasIntent: true }),
      qualifiedLeads: comments.count({ intentMin: threshold, targetOnly: true, replied: false }),
      intentThreshold: threshold,
    };
  }

  _createJob(type, meta) {
    const id = crypto.randomUUID();
    const job = {
      id,
      type,
      status: 'queued',
      progress: 0,
      message: '任务已排队',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      result: null,
      error: null,
      meta,
    };
    this._jobs.set(id, job);
    this._pruneJobs();
    return job;
  }

  _updateJob(id, patch) {
    const job = this._jobs.get(id);
    if (!job) return null;
    Object.assign(job, patch, { updatedAt: Date.now() });
    return job;
  }

  _publicJob(job) {
    if (!job) return null;
    return {
      id: job.id,
      type: job.type,
      status: job.status,
      progress: job.progress,
      message: job.message,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      result: job.result,
      error: job.error,
      meta: job.meta,
    };
  }

  _runJob(type, meta, worker) {
    const job = this._createJob(type, meta);
    Promise.resolve()
      .then(async () => {
        this._updateJob(job.id, { status: 'running', message: '任务执行中' });
        const result = await worker({
          update: (progress, message) => this._updateJob(job.id, {
            progress: clampInteger(progress, 0, 100, job.progress),
            message: message || job.message,
          }),
        });
        this._updateJob(job.id, {
          status: 'succeeded',
          progress: 100,
          message: '完成',
          result,
        });
      })
      .catch(error => {
        this._updateJob(job.id, {
          status: 'failed',
          message: error.message || '任务失败',
          error: error.message || '任务失败',
        });
      });
    return job;
  }

  _pruneJobs() {
    const cutoff = Date.now() - JOB_TTL_MS;
    for (const [id, job] of this._jobs.entries()) {
      if (job.updatedAt < cutoff) this._jobs.delete(id);
    }
    while (this._jobs.size > MAX_JOBS) {
      const oldest = [...this._jobs.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt)[0];
      if (!oldest) break;
      this._jobs.delete(oldest[0]);
    }
  }

  getJob(id) {
    return this._publicJob(this._jobs.get(id));
  }

  async resolveVideoInput(input) {
    this._ensureContext();
    const raw = String(input || '').trim();
    if (!raw) throw new Error('请输入视频链接或 aweme_id');

    const digits = raw.match(/^\d{10,}$/);
    if (digits) {
      return { awemeId: digits[0], source: 'aweme_id' };
    }

    let url;
    try {
      url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    } catch (_) {
      throw new Error('无法识别该视频链接');
    }

    const candidates = [
      url.pathname.match(/\/video\/(\d+)/),
      url.pathname.match(/\/note\/(\d+)/),
      url.searchParams.get('modal_id'),
      url.searchParams.get('aweme_id'),
      url.searchParams.get('item_id'),
    ];
    for (const candidate of candidates) {
      const awemeId = Array.isArray(candidate) ? candidate[1] : candidate;
      if (awemeId) return { awemeId: String(awemeId), source: 'url' };
    }

    // 短链 v.douyin.com 通常需要跟随一次重定向才能拿到最终视频页 URL。
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(url.toString(), {
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
        },
        signal: controller.signal,
      });
      clearTimeout(timer);
      const finalUrl = response.url || url.toString();
      const finalId = this._extractAwemeId(finalUrl);
      if (finalId) return { awemeId: finalId, source: 'redirect' };
    } catch (_) {
      // 网络不可用或短链无法解析时仍给出友好错误，不吞掉原始输入。
    }

    throw new Error('未能从链接中解析出 aweme_id，请直接粘贴数字视频 ID');
  }

  _extractAwemeId(value) {
    if (!value) return null;
    const match = String(value).match(/(?:video|note)\/(\d{10,})|[?&](?:modal_id|aweme_id|item_id)=(\d{10,})/);
    return match ? (match[1] || match[2]) : null;
  }

  discoverVideos(input = {}) {
    const settings = this._loadSettings();
    const keyword = String(input.keyword || settings.targetCustomer || '').trim();
    if (!keyword) throw new Error('请先填写目标客户关键词');
    this._requireConnection();
    const count = clampInteger(input.count, 1, 20, settings.searchVideoCount || 5);

    return this._runJob('videos:discover', { keyword, count }, async ({ update }) => {
      this._ensureContext();
      update(5, `正在搜索“${keyword}”`);
      const items = await this._ctx.cmdSearch([keyword, '--count', String(count)]);
      const normalized = (items || []).map(normalizeSearchItem).filter(Boolean);

      update(25, `筛选出 ${normalized.length} 个候选视频，准备抓取候选评论`);
      const commentsSettings = this._loadSettings();
      const maxComments = clampInteger(
        input.maxCommentsPerVideo ?? commentsSettings.maxCommentsPerVideo,
        0,
        10000,
        commentsSettings.maxCommentsPerVideo,
      );

      const discovered = [];
      for (let index = 0; index < normalized.length; index++) {
        const video = normalized[index];
        videos.upsert({
          awemeId: video.awemeId,
          title: video.title,
          authorUid: video.authorUid,
        });

        const baseProgress = 25 + Math.round((index / Math.max(normalized.length, 1)) * 60);
        update(baseProgress, `正在抓取候选视频 ${index + 1}/${normalized.length} 的候选评论`);
        try {
          video.comments = await this._fetchComments(video.awemeId, maxComments);
          video.commentCount = video.comments.length;
        } catch (error) {
          video.comments = [];
          video.commentCount = 0;
          video.fetchError = error.message || '评论抓取失败';
        }
        discovered.push(video);
      }

      update(95, '正在整理结果');
      return { keyword, count, videos: discovered };
    });
  }

  fetchComments(awemeId, input = {}) {
    const id = String(awemeId || '').trim();
    if (!/^\d{10,}$/.test(id)) throw new Error('无效的 aweme_id');
    this._requireConnection();
    const settings = this._loadSettings();
    const maxComments = clampInteger(
      input.maxCommentsPerVideo ?? settings.maxCommentsPerVideo,
      0,
      10000,
      settings.maxCommentsPerVideo,
    );

    return this._runJob('comments:fetch', { awemeId: id, maxComments }, async ({ update }) => {
      this._ensureContext();
      update(15, `正在抓取候选视频 ${id} 的候选评论`);
      const items = await this._fetchComments(id, maxComments);
      update(95, `已抓取 ${items.length} 条候选评论`);
      return { awemeId: id, comments: items };
    });
  }

  async _fetchComments(awemeId, maxComments) {
    this._ensureContext();
    const limit = clampInteger(maxComments, 0, 10000, 0);
    const args = limit === 0
      ? [String(awemeId), '--count', '20', '--all']
      : [String(awemeId), '--count', '20', '--pages', String(Math.ceil(limit / 20))];
    const items = await this._ctx.cmdGet(args);
    return limit > 0 ? items.slice(0, limit) : items;
  }

  replyToComment(awemeId, cid, text) {
    const videoId = String(awemeId || '').trim();
    const commentId = String(cid || '').trim();
    const replyText = String(text || '').trim();
    if (!/^\d{10,}$/.test(videoId)) throw new Error('无效的 aweme_id');
    if (!commentId) throw new Error('缺少评论 cid');
    if (!replyText) throw new Error('请输入回复内容');
    if (replyText.length > 1000) throw new Error('回复内容过长');
    this._requireConnection();

    return this._runJob('comment:reply', {
      awemeId: videoId,
      cid: commentId,
      text: replyText,
    }, async ({ update }) => {
      this._ensureContext();
      update(10, '正在提交回复，等待抖音响应');
      const result = await this._ctx.cmdPost([
        videoId,
        replyText,
        '--reply-to',
        commentId,
      ]);
      update(95, '回复已发布');
      return result;
    });
  }

  /**
   * 一体化运营：AI 扩词 → 多关键词搜索去重 → 每视频抓评论 → 统一回复。
   *
   * @param {object} input
   * @param {string} [input.keyword]        客户关键词（缺省用设置里的目标客户）
   * @param {number} [input.videoCount]     候选视频数（1-20）
   * @param {number} [input.commentsPerVideo] 每个视频抓取评论数（0 = 全部）
   * @param {boolean} [input.keywordExpandEnabled] 是否启用 AI 扩词
   * @param {number} [input.keywordExpandCount] AI 扩词数量（2-30）
   * @param {string} [input.replyText]      统一回复文案（留空则只检索抓取不回复）
   * @returns {object} job
   */
  runCampaign(input = {}) {
    const settings = this._loadSettings();
    const keyword = String(input.keyword || settings.targetCustomer || '').trim();
    if (!keyword) throw new Error('请先填写客户关键词');
    this._requireConnection();

    const videoCount = clampInteger(
      input.videoCount ?? settings.searchVideoCount,
      1,
      20,
      settings.searchVideoCount || 5,
    );
    const commentsPerVideo = clampInteger(
      input.commentsPerVideo ?? settings.maxCommentsPerVideo,
      0,
      10000,
      settings.maxCommentsPerVideo ?? 5,
    );
    const expandEnabled = input.keywordExpandEnabled !== false
      && settings.keywordExpandEnabled !== false;
    const expandCount = clampInteger(
      input.keywordExpandCount ?? settings.keywordExpandCount,
      2,
      30,
      settings.keywordExpandCount || 10,
    );
    const replyText = String(input.replyText ?? settings.defaultReplyText ?? '').trim();
    if (replyText.length > 1000) throw new Error('统一回复内容过长（最多 1000 字）');

    return this._runJob('campaign:run', {
      keyword,
      videoCount,
      commentsPerVideo,
      expandEnabled,
      replyEnabled: replyText.length > 0,
    }, async ({ update }) => {
      this._ensureContext();
      const warnings = [];

      // 1) AI 扩词：原始关键词永远保留在最前，扩词失败时回退为单关键词检索
      const seeds = [keyword];
      if (expandEnabled) {
        update(4, `AI 正在基于“${keyword}”扩展搜索关键词`);
        try {
          const expanded = await this._getLlm().expandSearchKeywords(keyword, expandCount);
          seeds.push(...expanded);
        } catch (error) {
          warnings.push(`AI 扩词失败（${error.message}），改用原始关键词继续检索`);
          console.error(`[app] keyword expansion failed: ${error.message}`);
        }
      }
      const keywords = [];
      const keywordSet = new Set();
      for (const seed of seeds) {
        const clean = String(seed || '').trim();
        if (!clean) continue;
        const key = clean.toLowerCase();
        if (keywordSet.has(key)) continue;
        keywordSet.add(key);
        keywords.push(clean);
      }

      // 2) 逐关键词搜索并按 aweme_id 去重，凑够 videoCount 个候选视频
      const selectedVideos = [];
      const seenAweme = new Set();
      const searchedKeywords = [];
      const perSearch = Math.min(20, videoCount + 2);
      for (let index = 0; index < keywords.length && selectedVideos.length < videoCount; index++) {
        const kw = keywords[index];
        const progress = 8 + Math.round(((index + 1) / Math.max(keywords.length, 1)) * 32);
        update(progress, `正在搜索“${kw}”（已筛出 ${selectedVideos.length}/${videoCount} 个候选视频）`);
        let items;
        try {
          items = await this._ctx.cmdSearch([kw, '--count', String(perSearch)]);
        } catch (error) {
          warnings.push(`关键词“${kw}”搜索失败：${error.message}`);
          continue;
        }
        searchedKeywords.push(kw);
        for (const item of items || []) {
          const video = normalizeSearchItem(item);
          if (!video || seenAweme.has(video.awemeId)) continue;
          seenAweme.add(video.awemeId);
          selectedVideos.push(video);
          if (selectedVideos.length >= videoCount) break;
        }
      }
      if (searchedKeywords.length === 0) {
        throw new Error('搜索未返回结果，请确认抖音主站页面已连接');
      }

      update(46, `已筛选出 ${selectedVideos.length} 个候选视频，开始逐个抓取候选评论`);

      // 3) 每个视频抓取 commentsPerVideo 条评论
      for (let index = 0; index < selectedVideos.length; index++) {
        const video = selectedVideos[index];
        videos.upsert({
          awemeId: video.awemeId,
          title: video.title,
          authorUid: video.authorUid,
        });
        const progress = 48 + Math.round(((index + 1) / Math.max(selectedVideos.length, 1)) * 28);
        update(progress, `正在抓取候选视频 ${index + 1}/${selectedVideos.length} 的候选评论`);
        try {
          video.comments = (await this._fetchComments(video.awemeId, commentsPerVideo))
            .map(normalizeCampaignComment)
            .filter(c => c.cid);
        } catch (error) {
          video.comments = [];
          video.fetchError = error.message || '评论抓取失败';
        }
        video.commentCount = video.comments.length;
      }

      // 4) 统一回复：逐条对未回复的候选评论调用 cmdPost，逐个上报进度
      const replyStats = { target: 0, succeeded: 0, failed: 0, skipped: 0 };
      if (replyText) {
        const totalComments = selectedVideos.reduce((sum, v) => sum + (v.comments?.length || 0), 0);
        let repliedSoFar = 0;
        for (const video of selectedVideos) {
          video.replies = [];
          for (const comment of video.comments || []) {
            repliedSoFar += 1;
            const progress = 78 + Math.round((repliedSoFar / Math.max(totalComments, 1)) * 18);
            replyStats.target += 1;
            const stored = comments.get(comment.cid);
            if (stored && stored.replied) {
              replyStats.skipped += 1;
              video.replies.push({ cid: comment.cid, status: 'skipped', message: '此前已回复过' });
              update(progress, `跳过已回复的候选评论 ${repliedSoFar}/${totalComments}`);
              continue;
            }
            if (!comment.text) {
              replyStats.skipped += 1;
              video.replies.push({ cid: comment.cid, status: 'skipped', message: '贴纸/无文字评论' });
              update(progress, `跳过无文字候选评论 ${repliedSoFar}/${totalComments}`);
              continue;
            }
            update(progress, `正在统一回复 ${video.awemeId.slice(0, 8)} 的第 ${repliedSoFar}/${totalComments} 条候选评论`);
            try {
              await this._ctx.cmdPost([
                video.awemeId,
                replyText,
                '--reply-to',
                comment.cid,
              ]);
              replyStats.succeeded += 1;
              video.replies.push({ cid: comment.cid, status: 'replied' });
            } catch (error) {
              replyStats.failed += 1;
              video.replies.push({ cid: comment.cid, status: 'failed', message: error.message });
              warnings.push(`回复 ${comment.cid} 失败：${error.message}`);
            }
          }
        }
        update(97, `统一回复完成：成功 ${replyStats.succeeded}，失败 ${replyStats.failed}，跳过 ${replyStats.skipped}`);
      }

      update(100, '一体化流程完成');
      return {
        keyword,
        keywords,
        searchedKeywords,
        videoCount: selectedVideos.length,
        commentsPerVideo,
        replyText: replyText || null,
        replyStats,
        warnings,
        videos: selectedVideos.map(video => ({
          awemeId: video.awemeId,
          title: video.title,
          authorNickname: video.authorNickname,
          createTime: video.createTime,
          stats: video.stats,
          commentCount: video.commentCount,
          fetchError: video.fetchError || null,
          comments: video.comments || [],
          replies: video.replies || [],
        })),
      };
    });
  }

  listVideos() {
    const rows = videos.list({ limit: 200 });
    return rows.map(item => {
      const video = normalizeStoredVideo(item);
      video.commentCount = comments.count({ awemeId: item.awemeId });
      return video;
    });
  }

  listComments(awemeId, opts = {}) {
    const id = String(awemeId || '').trim();
    if (!/^\d{10,}$/.test(id)) return [];
    const replied = opts.replied === 'true' || opts.replied === true
      ? true
      : opts.replied === 'false' || opts.replied === false ? false : undefined;
    const limit = clampInteger(opts.limit, 1, 10000, 200);
    return comments.listByVideoDetailed(id, {
      limit,
      replied,
      query: opts.query,
      intentMin: opts.intentMin,
      hasIntent: opts.hasIntent,
      targetOnly: opts.targetOnly,
    });
  }
}

module.exports = {
  AppController,
  createCommandContext,
  normalizeSearchItem,
  normalizeCampaignComment,
};

// lib/app/controller.js — 前端工作台的本地业务控制器
//
// 这个模块只在 Bridge Server 进程内运行。它把 CLI 命令层（search/get/post）
// 包装成适合 /api/app/* 使用的异步任务，前端只拿任务进度和已脱敏的结果。

const crypto = require('crypto');
const { readConfig } = require('../paths');
const { AuditLogger } = require('../audit');
const { BridgeClient } = require('../client/bridge-client');
const commands = require('../commands');
const { SITE } = require('../commands/helpers');
const videos = require('../memory/videos');
const comments = require('../memory/comments');
const users = require('../memory/users');
const dmMemory = require('../memory/dm');
const drafts = require('../memory/drafts');
const appJobs = require('../memory/app-jobs');
const settingsModule = require('./settings');
const {
  buildIntentPrompt,
  buildReplyPrompt,
  normalizeIntentResult,
  normalizeReplyResult,
} = require('./lead-prompts');

const MAX_JOBS = 200;
// 抖音搜索共用一个浏览器登录态；并发搜索既不会提升单轮询通道吞吐，
// 还会放大风控。串行执行并在业务错误码出现时立即熔断。
const SEARCH_CONCURRENCY = 1;
const COMMENT_FETCH_CONCURRENCY = 3;
const INTENT_CONCURRENCY = 1;
const INTENT_BATCH_SIZE = 12;
const MODEL_API_CONTEXT_CLUES = Object.freeze([
  'api', '接口', 'claude', 'gpt', 'deepseek', 'gemini', 'openai', 'openrouter',
  '大模型', '语言模型', 'llm', 'token', 'ccswitch', 'rikkahub', 'opencode', 'codex',
]);
const API_RELAY_CONTEXT_CLUES = Object.freeze([
  '中转', '转发站', '第三方api', '第三方接口', '聚合api', 'api聚合', '服务商',
]);
const API_RELAY_PRICE_CLUES = Object.freeze([
  '价格', '多少钱', '收费', '倍率', '贵', '便宜', '计费', '成本', '比官网', '比直连', '预算',
]);
const API_RELAY_QUALITY_CLUES = Object.freeze([
  '稳定', '稳不稳', '参差', '掺水', '参水', '缩水', '降智', '靠谱', '踩坑', '延迟', '掉线', '限速',
]);
// 这些词用于“视频质量抽样”和未开启 AI 时的保守过滤。
// 只把明确表达购买/求票动作的短语作为高意向信号；“门票、推荐、需要”
// 这类泛词必须和票务语境组合出现，避免一个泛词把泛娱乐视频带进结果。
const HIGH_INTENT_CLUES = Object.freeze([
  '没抢到', '没买到', '难抢', '好难抢', '太难抢', '抢票好难', '抢不到', '买不到',
  '帮抢', '求票', '求购', '想买', '怎么买',
  '哪里买', '可以买', '能买到', '还有票', '有票吗', '票吗', '代抢', '回流票',
  '退票', '加场', '蹲票', '收票', '买票', '同求', '我也要', '我也想',
  '蹲一个', '错过了', '求链接', '求渠道', '哪里有', '转让', '出一张',
]);
const MEDIUM_INTENT_CLUES = Object.freeze([
  '有没有', '多少钱', '需要', '推荐', '靠谱', '门票', '有票', '票价', '场次',
  '座位', '有需求',
]);
const TICKET_CONTEXT_CLUES = Object.freeze([
  '票', '购票', '门票', '演唱会', '抢票', '场次', '座位', '看台', '链接',
  '渠道', '转让', '黄牛', '开票', '开售', '二开', '三开', '返场', '加场',
]);

function isModelApiRelayCampaign(customerProfile) {
  const value = String(customerProfile || '').toLowerCase();
  return value.includes('中转')
    && MODEL_API_CONTEXT_CLUES.some(clue => value.includes(clue.toLowerCase()));
}

function hasModelApiServiceContext(video) {
  const commentsText = (video?.sampleComments || []).map(comment => comment.text || '').join(' ');
  // Search keywords are only a discovery hint, not evidence that a result is
  // actually about model APIs. Use the returned video/comments themselves.
  const value = `${video?.title || ''} ${commentsText}`.toLowerCase();
  return MODEL_API_CONTEXT_CLUES.some(clue => value.includes(clue.toLowerCase()));
}

function scoreModelApiRelaySignal(text, contextText = '', customKeywords = []) {
  const value = String(text || '').trim().toLowerCase().replace(/\s+/g, '');
  const context = `${value} ${String(contextText || '')}`.toLowerCase().replace(/\s+/g, '');
  const relayTerms = API_RELAY_CONTEXT_CLUES.filter(clue => context.includes(clue));
  const hasRelayContext = relayTerms.length > 0;
  const matched = matchKeywords(text, customKeywords);
  if (!value || !hasRelayContext) {
    return { matched, highIntentHits: 0, mediumIntentHits: 0, signalPoints: 0, hasContext: false, qualifies: false };
  }

  const asksForProvider = /(?:求|找|需要|想找|想要|有没有|有无|谁有|推荐|给我|给个|来个|来一个|蹲).{0,12}(?:中转|转发站|服务商|聚合.?api|第三方.?api)|(?:中转|转发站|服务商).{0,12}(?:推荐|求|找一个|需要|来一个|来个|蹲)/i.test(value);
  const priceSignal = API_RELAY_PRICE_CLUES.some(clue => value.includes(clue));
  const asksAboutPrice = priceSignal
    && /(?:多少钱|多少|怎么收费|怎么计费|比官网|比直连|价格.{0,8}(?:吗|么|如何|怎么|多少|不写|没写|看不到)|收费.{0,8}(?:吗|么|如何|怎么|多少|不写|没写)|(?:我)?(?:比较)?关心.{0,8}(?:价格|收费|成本)|(?:求|有没有|找(?!到)).{0,8}(?:便宜|优惠|低价)|[?？])/i.test(value);
  const qualitySignal = API_RELAY_QUALITY_CLUES.some(clue => value.includes(clue));
  const asksAboutQuality = qualitySignal
    && /(?:稳不稳|稳定性.{0,8}(?:如何|怎么样|吗|么|未知|参差)|参差不齐|不稳定|(?:被)?(?:掺水|参水|缩水|降智|限速|掉线).{0,8}(?:吗|么|呢|未知|担心)|(?:我试过|之前用|用过).{0,20}(?:但|但是|参差|不稳定|踩坑|还未知)|(?:担心|不知道|还未知).{0,12}(?:稳定|靠谱|效果)|(?:求|需要|想找|想要|推荐|有没有|找(?!到)).{0,8}(?:稳定|靠谱)|(?:怎么|如何).{0,8}(?:判断|辨别).{0,8}(?:中转|模型|降智)|(?:稳定|靠谱|效果).{0,8}[?？]|[?？].{0,8}(?:稳定|靠谱|效果))/i.test(value);
  const asksAboutIntegration = /(?:怎么|如何|哪|哪里|接入|配置|api.?key|密钥|接口)/i.test(value)
    && /(?:中转|服务商|第三方|api|接口)/i.test(value);
  const qualifies = asksForProvider || asksAboutPrice || asksAboutQuality || asksAboutIntegration;
  const highIntentHits = Number(asksForProvider) + Number(asksAboutPrice);
  const mediumIntentHits = Number(asksAboutQuality) + Number(asksAboutIntegration);
  const signalPoints = highIntentHits * 3 + mediumIntentHits * 2 + relayTerms.length;
  return { matched: [...new Set([...matched, ...relayTerms])], highIntentHits, mediumIntentHits, signalPoints, hasContext: true, qualifies };
}

function scoreCampaignSignal(text, customKeywords, contextText, relayCampaign) {
  return relayCampaign
    ? scoreModelApiRelaySignal(text, contextText, customKeywords)
    : scoreLeadSignal(text, customKeywords, contextText);
}

function clampInteger(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isInteger(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normalizeKeywordList(value, maxItems = 60) {
  const source = Array.isArray(value) ? value : String(value || '').split(/[\n,，、;；]+/);
  const seen = new Set();
  const result = [];
  for (const item of source) {
    const keyword = String(item || '').trim().slice(0, 100);
    const key = keyword.toLowerCase();
    if (!keyword || seen.has(key)) continue;
    seen.add(key);
    result.push(keyword);
    if (result.length >= maxItems) break;
  }
  return result;
}

function unixSeconds(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
}

function isWithinDays(timestamp, days, nowSeconds = Math.floor(Date.now() / 1000)) {
  const range = Number(days || 0);
  const value = unixSeconds(timestamp);
  if (!range || !value) return true;
  return value >= nowSeconds - range * 86400;
}

function matchKeywords(text, keywords) {
  if (!keywords.length) return [];
  const normalized = String(text || '').toLowerCase();
  return keywords.filter(keyword => normalized.includes(keyword.toLowerCase()));
}

function scoreLeadSignal(text, customKeywords = [], contextText = '') {
  const value = String(text || '').trim();
  if (!value) {
    return {
      matched: [], highIntentHits: 0, mediumIntentHits: 0, signalPoints: 0,
      hasContext: false, qualifies: false,
    };
  }
  const normalized = value.toLowerCase();
  const explicit = matchKeywords(value, customKeywords);
  const high = HIGH_INTENT_CLUES.filter(clue => normalized.includes(clue.toLowerCase()));
  const medium = MEDIUM_INTENT_CLUES.filter(clue => normalized.includes(clue.toLowerCase()));
  const context = `${value} ${String(contextText || '')}`.toLowerCase();
  const hasContext = TICKET_CONTEXT_CLUES.some(clue => context.includes(clue.toLowerCase()));
  const hasStrongTicketContext = ['二开', '三开', '开票', '开售', '返场', '加场']
    .some(clue => context.includes(clue));

  // 手动线索词仍然优先，但泛词不能脱离上下文单独放行。
  if (customKeywords.length > 0) {
    const genericOnly = explicit.length > 0 && explicit.every(clue => (
      MEDIUM_INTENT_CLUES.some(item => item.toLowerCase() === clue.toLowerCase())
    ));
    const qualifies = explicit.length > 0 && (!genericOnly || hasContext);
    return {
      matched: explicit,
      highIntentHits: high.length,
      mediumIntentHits: medium.length,
      signalPoints: explicit.length * 2 + (hasContext ? 1 : 0),
      hasContext,
      qualifies,
    };
  }

  // 一个“推荐/需要/门票”不算有效线索；明确的购买动作，或两个以上泛词
  // 同时落在票务语境中，才认为这条评论值得进入后续判定。
  const hasDirectQuestion = medium.some(clue => clue === '有没有' || clue === '多少钱');
  const qualifies = high.length > 0
    || (hasContext && (medium.length >= 2 || (hasStrongTicketContext && hasDirectQuestion)));
  return {
    matched: [...new Set([...high, ...medium])],
    highIntentHits: high.length,
    mediumIntentHits: medium.length,
    signalPoints: high.length * 3 + Math.min(2, medium.length) + (hasContext ? 1 : 0),
    hasContext,
    qualifies,
  };
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index], index);
    }
  }
  const workers = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

function loadConfig() {
  return readConfig();
}

function createCommandContext(config = {}, defaultConnIndex = 0) {
  const cfg = config && config.bridge ? config : loadConfig();
  const bridge = new BridgeClient({
    host: cfg.bridge?.host || '127.0.0.1',
    port: cfg.bridge?.port || 19422,
    token: cfg.bridge?.token || '',
  });
  const audit = new AuditLogger();

  async function bridgeCall(expression, awaitPromise = true, connIndex = defaultConnIndex) {
    const resp = await bridge.call({ site: SITE, expression, awaitPromise, connIndex });
    if (resp.ok) return resp.value;
    throw new Error(resp.error || 'Bridge Server 返回未知错误');
  }

  async function loggedCallWith(logger, endpoint, params, expression) {
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
      logger.logApiCall(endpoint, params, ms, 'success', summary);
      return result;
    } catch (error) {
      logger.logApiCall(endpoint, params, Date.now() - startedAt, 'error', { error: error.message });
      throw error;
    }
  }

  const ctx = {
    bridge,
    audit,
    config: cfg,
    bridgeCall,
    loggedCall: (endpoint, params, expression) => loggedCallWith(audit, endpoint, params, expression),
    cmdGet: null,
    cmdPost: null,
    cmdSearch: null,
    cmdDM: null,
  };
  // 每个并发命令使用独立 AuditLogger，避免多个后台任务互相覆盖当前操作。
  function scopedContext() {
    const scopedAudit = new AuditLogger();
    return {
      ...ctx,
      audit: scopedAudit,
      loggedCall: (endpoint, params, expression) => loggedCallWith(scopedAudit, endpoint, params, expression),
    };
  }
  ctx.cmdGet = args => commands.get(scopedContext(), args);
  ctx.cmdPost = args => commands.post(scopedContext(), args);
  ctx.cmdSearch = args => commands.search(scopedContext(), args);
  ctx.cmdDM = args => commands.dm(scopedContext(), args);
  return { ctx, bridge, audit, config: cfg };
}

function normalizeSearchItem(item) {
  const awemeId = item.aweme_id || item.awemeId;
  if (!awemeId) return null;
  return {
    awemeId: String(awemeId),
    title: item.desc || item.title || '',
    authorNickname: (typeof item.author === 'string' ? item.author : item.author?.nickname) || item.authorNickname || '',
    authorUid: item.author?.uid || item.uid || item.authorUid || '',
    createTime: item.time || item.create_time || item.createTime || 0,
    stats: {
      playCount: Number(item.plays || item.stats?.playCount || 0),
      commentCount: Number(item.comments || item.comment_count || item.stats?.commentCount || 0),
      likeCount: Number(item.likes || item.digg_count || item.stats?.likeCount || 0),
      shareCount: Number(item.shares || item.share_count || item.stats?.shareCount || 0),
      collectCount: Number(item.collects || item.collect_count || item.stats?.collectCount || 0),
    },
  };
}

function titleRelevanceScore(title, keyword = '') {
  const source = String(title || '').toLowerCase();
  const query = String(keyword || '').trim().toLowerCase();
  if (!source || !query) return 0;
  if (source.includes(query)) return 15;
  const compact = query.replace(/[\s,，、;；|/\\]+/g, '');
  if (!compact) return 0;
  const chunks = [];
  if (compact.length <= 2) chunks.push(compact);
  else {
    for (let index = 0; index < compact.length - 1; index += 1) {
      chunks.push(compact.slice(index, index + 2));
    }
  }
  const hits = [...new Set(chunks)].filter(chunk => source.includes(chunk)).length;
  return Math.min(12, hits * 3);
}

function metadataQualityScore(video, nowSeconds = Math.floor(Date.now() / 1000), keyword = '') {
  const stats = video.stats || {};
  const commentCount = Math.max(0, Number(stats.commentCount || 0));
  const engagement = Math.max(0,
    Number(stats.likeCount || 0) + Number(stats.shareCount || 0) * 3 + Number(stats.collectCount || 0) * 2);
  const ageDays = video.createTime
    ? Math.max(0, (nowSeconds - unixSeconds(video.createTime)) / 86400)
    : 365;
  const commentScore = Math.min(55, Math.log10(commentCount + 1) * 18);
  const engagementScore = Math.min(20, Math.log10(engagement + 1) * 5);
  const freshnessScore = Math.max(0, 25 - Math.min(25, ageDays * 1.5));
  const relevance = titleRelevanceScore(video.title, keyword);
  video.titleRelevanceScore = relevance;
  return Math.round((commentScore + engagementScore + freshnessScore + relevance) * 10) / 10;
}

function scoreSampledVideo(video, clueKeywords, commentTimeRangeDays, relayCampaign = false) {
  const sample = video.sampleComments || [];
  const recent = sample.filter(comment => comment.text && isWithinDays(comment.time, commentTimeRangeDays));
  const videoContext = relayCampaign
    ? String(video.title || '')
    : `${video.title || ''} ${video.sourceKeyword || ''}`;
  const signals = recent.map(comment => scoreCampaignSignal(comment.text, clueKeywords, videoContext, relayCampaign));
  const clueHits = recent.filter((comment, index) => signals[index].qualifies);
  const highIntentHits = signals.reduce((sum, signal) => sum + signal.highIntentHits, 0);
  const signalPoints = signals
    .filter(signal => signal.qualifies)
    .reduce((sum, signal) => sum + signal.signalPoints, 0);
  const density = recent.length ? clueHits.length / recent.length : 0;
  const sampleScore = Math.min(55, clueHits.length * 8 + highIntentHits * 3 + Math.min(8, signalPoints) + density * 24);
  video.sampleCommentCount = sample.length;
  video.sampleRecentCount = recent.length;
  video.sampleClueHits = clueHits.length;
  video.sampleHighIntentHits = highIntentHits;
  video.sampleSignalPoints = signalPoints;
  video.sampleClueTerms = [...new Set(signals
    .filter(signal => signal.qualifies)
    .flatMap(signal => signal.matched))].slice(0, 12);
  video.leadDensity = Math.round(density * 1000) / 1000;
  video.qualityScore = Math.round((Number(video.metadataScore || 0) * 0.48 + sampleScore) * 10) / 10;
  const parts = [];
  parts.push(`${video.stats?.commentCount || 0} 条视频评论`);
  parts.push(`抽样 ${sample.length} 条`);
  parts.push(`${recent.length} 条在时间范围内`);
  parts.push(`${clueHits.length} 条有效需求线索`);
  if (video.sampleClueTerms.length > 0) parts.push(`含 ${video.sampleClueTerms.slice(0, 3).join('、')}`);
  video.qualityReason = parts.join('，');
  return video;
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
    this._jobStore = options.jobStore !== undefined
      ? options.jobStore
      : (process.env.NODE_ENV === 'test' ? null : appJobs);
    this._hasConnection = typeof options.hasConnection === 'function'
      ? options.hasConnection
      : () => true;
    this._jobs = new Map();
    this._restoreJobs();
    this._replyLocks = new Set();
    this._replyQueue = Promise.resolve();
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

  /** 为多账号工作流创建绑定到指定浏览器连接的命令上下文。 */
  _getContextForConnection(connIndex) {
    const index = Number.isInteger(Number(connIndex)) ? Math.max(0, Number(connIndex)) : 0;
    if (index === 0) {
      this._ensureContext();
      return this._ctx;
    }
    return createCommandContext(this._config || undefined, index).ctx;
  }

  async checkDouyinSession(options = {}) {
    this._requireConnection();
    const context = this._getContextForConnection(options.connIndex);
    const expression = `(async()=>{try{if(window.__bridge&&window.__bridge.getProfile){const p=await window.__bridge.getProfile();return{status_code:p&&p.uid?0:-1,status_msg:p&&p.uid?'':'未读取到登录账号',uid:p&&p.uid||'',nickname:p&&p.nickname||'',avatar:p&&p.avatar||'',sec_uid:p&&p.secUid||''}}const r=await fetch('/aweme/v1/web/query/user/?device_platform=webapp&aid=6383&channel=channel_pc_web',{credentials:'include'});const d=await r.json();const u=d.user||d.user_info||d.data?.user||{};let local={};try{local=JSON.parse(localStorage.getItem('user_info')||'{}')}catch(_){}return{status_code:d.status_code??0,status_msg:d.status_msg||d.message||'',uid:d.user_uid||d.uid||u.uid||u.uid_str||'',nickname:d.nickname||d.user_nickname||u.nickname||local.nickname||'',avatar:d.avatar_url||u.avatar_url||local.avatarUrl||'',sec_uid:u.sec_uid||local.uid||''}}catch(e){return{status_code:-1,status_msg:e&&e.message?e.message:String(e)}}})()`;
    const data = await context.bridgeCall(expression);
    const statusCode = Number(data?.status_code ?? -1);
    const authenticated = statusCode === 0 && Boolean(data?.uid);
    return {
      connected: true,
      authenticated,
      statusCode,
      uid: authenticated ? String(data?.uid || '') : '',
      message: authenticated
        ? '抖音账号登录有效'
        : statusCode === 2483
          ? '请先登录抖音，再继续搜索'
          : String(data?.status_msg || '未检测到有效的抖音登录账号'),
      nickname: authenticated ? String(data.nickname || '') : '',
      avatar: authenticated ? String(data.avatar || '') : '',
      secUid: authenticated ? String(data.sec_uid || '') : '',
      checkedAt: Date.now(),
    };
  }

  /** 读取指定账号标签页里的 DM 队列，并落库为真实私信消息。 */
  async listDMs(options = {}) {
    this._requireConnection();
    const context = this._getContextForConnection(options.connIndex);
    try {
      const data = await context.bridgeCall(`(async()=>{try{if(window.__bridge&&window.__bridge.connectDMWS)window.__bridge.connectDMWS();const rows=window.__bridge&&window.__bridge.getDMs?window.__bridge.getDMs():[];return Array.isArray(rows)?rows:(rows&&rows.messages||[])}catch(e){return[{type:'system',status:'unavailable',message:e&&e.message?e.message:String(e)}]}})()`);
      const rows = Array.isArray(data) ? data : (data?.messages || []);
      const accountId = String(options.accountId || options.accountUid || `connection:${Number(options.connIndex || 0)}`);
      const accountNickname = String(options.accountNickname || '');
      for (const row of rows) {
        if (!row || row.type === 'system' || !row.conversation_id) continue;
        const senderUid = String(row.sender || row.sender_uid || '');
        if (senderUid) users.upsert({ uid: senderUid, nickname: row.sender_nickname || '', seenAt: row.timestamp || Date.now(), commentDelta: 0 });
        dmMemory.appendMessage({
          accountId,
          conversationId: row.conversation_id,
          peerUid: senderUid,
          senderUid,
          senderNickname: row.sender_nickname || '',
          content: row.content,
          messageType: row.message_type,
          remoteId: row.index || row.message_id || '',
          createdAt: row.timestamp || Date.now(),
          direction: senderUid && options.accountUid && senderUid === String(options.accountUid) ? 'outbound' : 'inbound',
          peerNickname: row.peer_nickname || '',
        });
      }
      return rows.map(row => ({ ...row, accountId, accountName: accountNickname }));
    } catch (error) {
      return [{
        type: 'system',
        status: 'unavailable',
        message: error.message || '私信桥接暂不可用',
      }];
    }
  }

  /** 发出一条真实抖音私信，并把发送结果写入同一条会话。 */
  sendDM(options = {}) {
    this._requireConnection();
    const peerUid = String(options.peerUid || options.uid || '').trim();
    const text = String(options.text || '').trim();
    if (!/^\S{3,}$/.test(peerUid)) throw new Error('私信对象 UID 无效');
    if (!text) throw new Error('私信内容不能为空');
    const connIndex = Number.isInteger(Number(options.connIndex)) ? Number(options.connIndex) : 0;
    const accountId = String(options.accountId || options.accountUid || `connection:${connIndex}`);
    return this._runJob('dm:send', { peerUid, accountId, connIndex }, async ({ update }) => {
      update(10, '正在创建抖音私信会话', { phase: 'create-conversation' });
      const context = this._getContextForConnection(connIndex);
      const result = await context.cmdDM([peerUid, text]);
      const conversationId = String(result?.conversation_id || options.conversationId || `peer:${peerUid}`);
      users.upsert({ uid: peerUid, nickname: options.peerNickname || '', seenAt: Date.now(), commentDelta: 0 });
      dmMemory.appendMessage({
        accountId,
        conversationId,
        peerUid,
        senderUid: options.accountUid || '',
        senderNickname: options.accountNickname || '',
        peerNickname: options.peerNickname || '',
        content: text,
        messageType: 'text',
        remoteId: `local:${Date.now()}:${crypto.randomUUID()}`,
        createdAt: Date.now(),
        direction: 'outbound',
        status: 'sent',
      });
      update(100, '私信已发送', { phase: 'sent', conversationId });
      return { ...result, conversationId, peerUid, text, accountId };
    });
  }

  updateLlmConfig(llmConfig = {}) {
    const rootConfig = this._config || loadConfig();
    rootConfig.llm = { ...(rootConfig.llm || {}), ...llmConfig };
    this._config = rootConfig;
    if (this._ctx?.config) this._ctx.config.llm = rootConfig.llm;
    this._llm = null;
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

  async _loadWorkflowVideoContext(awemeId, mode = 'text-only', screenshotCount = 4, context = null) {
    this._ensureContext();
    const fallback = this._storedVideoContext(awemeId);
    try {
      const { loadVideoContext } = require('../reply-engine/video-context');
      const bridgeCall = context?.bridgeCall || this._ctx.bridgeCall;
      return await loadVideoContext(bridgeCall, awemeId, {
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
      startedAt: null,
      finishedAt: null,
      details: { phase: 'queued', current: 0, total: 0 },
      result: null,
      error: null,
      meta,
    };
    this._jobs.set(id, job);
    this._jobStore?.upsert(job);
    this._pruneJobs();
    return job;
  }

  _updateJob(id, patch) {
    const job = this._jobs.get(id);
    if (!job) return null;
    const next = { ...patch };
    if (patch.details) next.details = { ...(job.details || {}), ...patch.details };
    Object.assign(job, next, { updatedAt: Date.now() });
    this._jobStore?.upsert(job);
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
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      durationMs: (job.finishedAt || Date.now()) - (job.startedAt || job.createdAt),
      details: job.details || {},
      result: job.result,
      error: job.error,
      meta: job.meta,
    };
  }

  _runJob(type, meta, worker) {
    const job = this._createJob(type, meta);
    Promise.resolve()
      .then(async () => {
        this._updateJob(job.id, {
          status: 'running',
          message: '任务执行中',
          startedAt: Date.now(),
          details: { phase: 'starting' },
        });
        const result = await worker({
          update: (progress, message, details = {}) => this._updateJob(job.id, {
            progress: Math.max(job.progress, clampInteger(progress, 0, 100, job.progress)),
            message: message || job.message,
            details,
          }),
        });
        this._updateJob(job.id, {
          status: 'succeeded',
          progress: 100,
          message: '完成',
          finishedAt: Date.now(),
          details: { phase: 'completed' },
          result,
        });
      })
      .catch(error => {
        this._updateJob(job.id, {
          status: 'failed',
          message: error.message || '任务失败',
          error: error.message || '任务失败',
          finishedAt: Date.now(),
          details: { phase: 'failed' },
        });
      });
    return job;
  }

  _pruneJobs() {
    while (this._jobs.size > MAX_JOBS) {
      const oldest = [...this._jobs.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt)[0];
      if (!oldest) break;
      this._jobs.delete(oldest[0]);
    }
  }

  _restoreJobs() {
    if (!this._jobStore) return;
    const restored = this._jobStore.list({ limit: MAX_JOBS });
    const now = Date.now();
    for (const item of restored) {
      const job = { ...item };
      if (job.status === 'queued' || job.status === 'running') {
        job.status = 'failed';
        job.message = '服务重启，任务已中断，请重新执行';
        job.error = job.message;
        job.finishedAt = now;
        job.updatedAt = now;
        job.details = { ...(job.details || {}), phase: 'interrupted' };
        this._jobStore.upsert(job);
      }
      this._jobs.set(job.id, job);
    }
  }

  getJob(id) {
    const job = this._jobs.get(id) || this._jobStore?.get(id);
    if (job && !this._jobs.has(id)) this._jobs.set(id, job);
    return this._publicJob(job);
  }

  listJobs(opts = {}) {
    this._pruneJobs();
    const limit = clampInteger(opts.limit, 1, MAX_JOBS, 100);
    return [...this._jobs.values()]
      .filter(job => !opts.status || job.status === opts.status)
      .filter(job => !opts.type || job.type === opts.type)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
      .map(job => this._publicJob(job));
  }

  async _replyOnce(awemeId, cid, text, context = null) {
    const commentId = String(cid || '');
    const stored = comments.get(commentId);
    if (stored?.replied) return { status: 'skipped', message: '此前已回复过' };
    if (stored?.uid && users.get(String(stored.uid))?.replyCount > 0) {
      return { status: 'skipped', message: '该用户此前已回复过' };
    }
    if (this._replyLocks.has(commentId)) return { status: 'skipped', message: '另一任务正在回复' };
    this._replyLocks.add(commentId);
    try {
      const publish = async () => {
        const latest = comments.get(commentId);
        if (latest?.replied) return { status: 'skipped', message: '此前已回复过' };
        if (latest?.uid && users.get(String(latest.uid))?.replyCount > 0) {
          return { status: 'skipped', message: '该用户此前已回复过' };
        }
        const result = await (context || this._ctx).cmdPost([
          String(awemeId),
          String(text),
          '--reply-to',
          commentId,
        ]);
        drafts.markPostedByComment(String(awemeId), commentId);
        return { status: 'replied', result };
      };
      const queued = this._replyQueue.then(publish, publish);
      this._replyQueue = queued.then(() => undefined, () => undefined);
      return await queued;
    } finally {
      this._replyLocks.delete(commentId);
    }
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

  async _fetchComments(awemeId, maxComments, context = null) {
    const commandContext = context || this._getContextForConnection(0);
    const limit = clampInteger(maxComments, 0, 10000, 0);
    const args = limit === 0
      ? [String(awemeId), '--count', '20', '--all']
      : [String(awemeId), '--count', '20', '--pages', String(Math.ceil(limit / 20))];
    const items = await commandContext.cmdGet(args);
    // 抖音偶尔会在翻页边界重复返回同一条评论。统一在业务层去重，
    // 否则扩展抽样时会把重复项当成新评论，挤掉真正的需求线索。
    const seen = new Set();
    const unique = [];
    for (const item of Array.isArray(items) ? items : []) {
      const cid = String(item?.cid || '').trim();
      const userUid = String(item?.user?.uid || item?.user?.uid_str || '').trim();
      const fallback = `${userUid}|${String(item?.text || '').trim()}|${Number(item?.time || item?.createdAt || 0)}`;
      const key = cid || `anonymous:${fallback}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(item);
    }
    return limit > 0 ? unique.slice(0, limit) : unique;
  }

  replyToComment(awemeId, cid, text, options = {}) {
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
      const context = this._getContextForConnection(options.connIndex);
      const published = await this._replyOnce(videoId, commentId, replyText, context);
      if (published.status === 'skipped') throw new Error(published.message || '这条评论已经回复过');
      update(95, '回复已发布');
      return published.result;
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
  _runCampaignLegacy(input = {}) {
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

  runCampaign(input = {}) {
    const settings = this._loadSettings();
    const keyword = String(input.keyword || settings.targetCustomer || '').trim();
    if (!keyword) throw new Error('请先填写客户画像');
    this._requireConnection();

    const videoCount = clampInteger(input.videoCount ?? settings.searchVideoCount, 1, 20, settings.searchVideoCount || 5);
    const commentsPerVideo = clampInteger(input.commentsPerVideo ?? settings.maxCommentsPerVideo, 0, 10000, settings.maxCommentsPerVideo ?? 5);
    const expandEnabled = input.keywordExpandEnabled !== false && settings.keywordExpandEnabled !== false;
    const expandCount = clampInteger(input.keywordExpandCount ?? settings.keywordExpandCount, 2, 30, settings.keywordExpandCount || 10);
    const replyText = String(input.replyText ?? settings.defaultReplyText ?? '').trim();
    if (replyText.length > 1000) throw new Error('统一回复内容过长（最多 1000 字）');
    const deliveryMode = input.deliveryMode === 'draft' ? 'draft' : 'publish';
    const dmText = String(input.dmText || '').trim();
    const dmLimit = clampInteger(input.dmLimit, 0, 100, 5);

    const manualKeywords = normalizeKeywordList(input.manualKeywords);
    const commentKeywords = normalizeKeywordList(input.commentKeywords);
    const relayCampaign = isModelApiRelayCampaign(keyword);
    const videoTimeRangeDays = clampInteger(input.videoTimeRangeDays ?? settings.videoTimeRangeDays, 0, 365, settings.videoTimeRangeDays ?? 0);
    const commentTimeRangeDays = clampInteger(input.commentTimeRangeDays ?? settings.commentTimeRangeDays, 0, 365, settings.commentTimeRangeDays ?? 0);
    const intentThreshold = clampInteger(input.intentThreshold ?? settings.intentThreshold, 0, 100, settings.intentThreshold ?? 65);
    const aiFilterEnabled = input.aiFilterEnabled != null
      ? input.aiFilterEnabled !== false
      : settings.aiIntentEnabled === true;
    const minVideoComments = clampInteger(input.minVideoComments ?? settings.minVideoComments, 0, 1000000, settings.minVideoComments ?? 20);
    const sampleCommentsPerVideo = clampInteger(input.sampleCommentsPerVideo ?? settings.sampleCommentsPerVideo, 5, 50, settings.sampleCommentsPerVideo ?? 20);
    const minVideoLeadClues = clampInteger(input.minVideoLeadClues ?? settings.minVideoLeadClues, 0, 20, settings.minVideoLeadClues ?? 1);

    return this._runJob('campaign:run', {
      keyword,
      videoCount,
      commentsPerVideo,
      expandEnabled,
      manualKeywordCount: manualKeywords.length,
      commentKeywordCount: commentKeywords.length,
      videoTimeRangeDays,
      commentTimeRangeDays,
      intentThreshold,
      aiFilterEnabled,
      minVideoComments,
      sampleCommentsPerVideo,
      minVideoLeadClues,
      replyEnabled: replyText.length > 0,
      deliveryMode,
      dmEnabled: dmText.length > 0,
      dmLimit,
    }, async ({ update }) => {
      const executionContext = this._getContextForConnection(input.connIndex);
      const warnings = [];
      const automationActions = input.actions || {};
      if (automationActions.like) warnings.push('点赞动作已记录配置，但当前版本暂未自动执行；评论与私信已按规则处理');
      if (automationActions.follow) warnings.push('关注动作已记录配置，但当前油猴桥接暂未开放关注接口');
      const metrics = {
        searchCalls: 0, searchFailed: 0, searchMs: 0,
        commentCalls: 0, commentFailed: 0, commentMs: 0,
        aiCalls: 0, aiFailed: 0, aiMs: 0,
        replyCalls: 0, replyFailed: 0, replyMs: 0,
        dmCalls: 0, dmFailed: 0, dmMs: 0,
      };
      const filterStats = {
        searchResultsRaw: 0,
        videosInvalid: 0,
        videosDuplicate: 0,
        videosTooOld: 0,
        videosLowComments: 0,
        videosSampled: 0,
        videosNoRecentComments: 0,
        videosWithoutClues: 0,
        videosWrongTopic: 0,
        videosWithoutFinalComments: 0,
        sampleComments: 0,
        sampleClueHits: 0,
        sampleExpandedVideos: 0,
        sampleExpandedComments: 0,
        sampleExpansionFailed: 0,
        commentsFetched: 0,
        commentsTooOld: 0,
        commentsWithoutText: 0,
        commentsKeywordMiss: 0,
        commentsSignalMiss: 0,
        aiFallbackComments: 0,
        previouslyReplied: 0,
        previouslyRepliedUsers: 0,
        eligible: 0,
        qualified: 0,
        uniqueLeads: 0,
        duplicateLeads: 0,
      };
      const report = (progress, message, details = {}) => update(progress, message, {
        ...details,
        metrics: { ...metrics },
        filterStats: { ...filterStats },
      });
      const repliedUserIds = new Set();
      const repliedUserCache = new Map();

      // 客户画像用于判断“谁是目标客户”，手动关键词更适合直接搜索。
      // 先搜索用户给出的短词，再把客户画像作为兜底查询，避免画像被遗漏。
      const seeds = manualKeywords.length ? [...manualKeywords, keyword] : [keyword];
      if (expandEnabled) {
        report(3, `AI 正在基于“${keyword}”扩展视频搜索词`, {
          phase: 'keyword-expansion', current: 0, total: 1,
        });
        try {
          const expanded = await this._getLlm().expandSearchKeywords(keyword, expandCount);
          seeds.push(...expanded);
          report(6, `关键词准备完成：手动 ${manualKeywords.length} 个，AI 扩展 ${expanded.length} 个`, {
            phase: 'keyword-expansion', current: 1, total: 1,
          });
        } catch (error) {
          warnings.push(`AI 扩词失败（${error.message}），改用原始画像和手动关键词继续检索`);
          console.error(`[app] keyword expansion failed: ${error.message}`);
        }
      }
      const keywords = normalizeKeywordList(seeds);
      // 目标视频数越多，允许覆盖的搜索表达越多；但单任务最多 8 个，
      // 防止一次 AI 扩词直接触发几十次抖音请求和账号风控。
      const searchBudget = Math.min(keywords.length, Math.max(3, Math.min(8, Math.ceil(videoCount / 5) + 2)));
      const searchTerms = keywords.slice(0, searchBudget);

      // 先建立候选池，不再把搜索接口最先返回的结果直接当作最终视频。
      const candidatePool = [];
      const seenAweme = new Set();
      const searchedKeywords = new Array(searchTerms.length);
      const perSearch = 20;
      let nextSearchIndex = 0;
      let completedSearches = 0;
      let fatalSearchError = null;
      const searchWorker = async () => {
        while (!fatalSearchError && nextSearchIndex < searchTerms.length) {
          const index = nextSearchIndex++;
          const searchKeyword = searchTerms[index];
          const startedAt = Date.now();
          metrics.searchCalls += 1;
          report(8 + Math.round((completedSearches / Math.max(searchTerms.length, 1)) * 24),
            `正在搜索“${searchKeyword}”（候选池 ${candidatePool.length} 个）`, {
              phase: 'douyin-search', current: completedSearches, total: searchTerms.length,
            });
          try {
            const items = await executionContext.cmdSearch([searchKeyword, '--count', String(perSearch)]);
            searchedKeywords[index] = searchKeyword;
            filterStats.searchResultsRaw += (items || []).length;
            for (const item of items || []) {
              const video = normalizeSearchItem(item);
              if (!video) {
                filterStats.videosInvalid += 1;
                continue;
              }
              if (seenAweme.has(video.awemeId)) {
                filterStats.videosDuplicate += 1;
                continue;
              }
              seenAweme.add(video.awemeId);
              if (!isWithinDays(video.createTime, videoTimeRangeDays)) {
                filterStats.videosTooOld += 1;
                continue;
              }
              video.sourceKeyword = searchKeyword;
              video.metadataScore = metadataQualityScore(video, Math.floor(Date.now() / 1000), searchKeyword);
              candidatePool.push(video);
            }
          } catch (error) {
            metrics.searchFailed += 1;
            warnings.push(`关键词“${searchKeyword}”搜索失败：${error.message}`);
            if (/status_code=\-?\d+|请先登录|登录态已失效/i.test(error.message)) {
              fatalSearchError = error;
            }
          } finally {
            metrics.searchMs += Date.now() - startedAt;
            completedSearches += 1;
            report(8 + Math.round((completedSearches / Math.max(searchTerms.length, 1)) * 24),
              `搜索完成 ${completedSearches}/${searchTerms.length}，得到 ${candidatePool.length} 个近期候选`, {
                phase: 'douyin-search', current: completedSearches, total: searchTerms.length,
              });
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(SEARCH_CONCURRENCY, searchTerms.length) }, () => searchWorker()));
      if (fatalSearchError) {
        throw new Error(`抖音账号登录检查失败：${fatalSearchError.message}`);
      }
      const completedKeywords = searchedKeywords.filter(Boolean);
      if (completedKeywords.length === 0 && metrics.searchFailed > 0) {
        throw new Error('抖音搜索全部失败，请检查抖音连接后重试');
      }

      candidatePool.sort((a, b) => b.metadataScore - a.metadataScore);
      let metadataCandidates = candidatePool.filter(video => Number(video.stats?.commentCount || 0) >= minVideoComments);
      filterStats.videosLowComments = candidatePool.length - metadataCandidates.length;
      if (metadataCandidates.length === 0 && candidatePool.length > 0) {
        metadataCandidates = candidatePool.filter(video => Number(video.stats?.commentCount || 0) > 0);
        if (metadataCandidates.length === 0) metadataCandidates = candidatePool;
        warnings.push(`没有视频达到“至少 ${minVideoComments} 条评论”，已降级抽样搜索候选`);
      }
      // 搜索接口按互动量排序，直接只抽样 videoCount 个会被泛娱乐热视频
      // 抢占名额。扩大候选抽样面，再用评论线索密度做第二次排序，优先保证
      // “真正有需求的人”而不是“最热门的视频”进入结果。
      const sampleLimit = Math.min(
        metadataCandidates.length,
        Math.max(videoCount, Math.min(40, Math.max(videoCount * 3, videoCount + 5))),
      );
      filterStats.videoSampleLimit = sampleLimit;
      const sampledCandidates = metadataCandidates.slice(0, sampleLimit);
      // 传空数组让 scoreLeadSignal 使用内置“高意向 + 语境”规则；
      // 不把内置词表当成手动关键词，否则泛词会绕过语境门槛。
      const qualityClues = commentKeywords;
      report(34, `候选池 ${candidatePool.length} 个，开始抽样 ${sampledCandidates.length} 个高互动视频`, {
        phase: 'video-sampling', current: 0, total: sampledCandidates.length,
      });

      // 先少量抓取评论验证近期活跃度与需求线索密度，再决定最终视频。
      let completedSamples = 0;
      await mapLimit(sampledCandidates, COMMENT_FETCH_CONCURRENCY, async (video) => {
        const startedAt = Date.now();
        metrics.commentCalls += 1;
        try {
          const initialSample = (await this._fetchComments(video.awemeId, sampleCommentsPerVideo, executionContext))
            .map(normalizeCampaignComment)
            .filter(comment => comment.cid);
          video.sampleComments = initialSample;
          filterStats.sampleComments += initialSample.length;
          scoreSampledVideo(video, qualityClues, commentTimeRangeDays, relayCampaign);
          filterStats.videosSampled += 1;
          filterStats.sampleClueHits += video.sampleClueHits;
          if (video.sampleRecentCount === 0) filterStats.videosNoRecentComments += 1;
          if (video.sampleClueHits < minVideoLeadClues) filterStats.videosWithoutClues += 1;

          // 首页评论经常是点赞高但与需求无关的泛评论。对“没有近期评论”或
          // “还没找到需求线索”的候选自动扩大采样，最多抓 80 条；这样能覆盖
          // 用户在评论区下方看到的“没抢到/求票/有没有三开”等真实线索。
          const expandedLimit = Math.min(80, Math.max(40, sampleCommentsPerVideo * 2));
          if (initialSample.length >= sampleCommentsPerVideo
            && sampleCommentsPerVideo < expandedLimit
            && (video.sampleRecentCount === 0 || video.sampleClueHits < minVideoLeadClues)) {
            const beforeRecent = video.sampleRecentCount;
            const beforeClues = video.sampleClueHits;
            const beforeNoRecent = beforeRecent === 0;
            const beforeWithoutClues = beforeClues < minVideoLeadClues;
            metrics.commentCalls += 1;
            try {
              const expandedSample = (await this._fetchComments(video.awemeId, expandedLimit, executionContext))
                .map(normalizeCampaignComment)
                .filter(comment => comment.cid);
              const seen = new Set();
              const merged = [];
              for (const comment of [...initialSample, ...expandedSample]) {
                if (seen.has(comment.cid)) continue;
                seen.add(comment.cid);
                merged.push(comment);
              }
              video.sampleComments = merged.slice(0, expandedLimit);
              filterStats.sampleExpandedVideos += 1;
              filterStats.sampleExpandedComments += Math.max(0, video.sampleComments.length - initialSample.length);
              filterStats.sampleComments += Math.max(0, video.sampleComments.length - initialSample.length);
              scoreSampledVideo(video, qualityClues, commentTimeRangeDays, relayCampaign);
              filterStats.sampleClueHits += video.sampleClueHits - beforeClues;
              if (beforeNoRecent && video.sampleRecentCount > 0) filterStats.videosNoRecentComments -= 1;
              if (!beforeNoRecent && video.sampleRecentCount === 0) filterStats.videosNoRecentComments += 1;
              if (beforeWithoutClues && video.sampleClueHits >= minVideoLeadClues) filterStats.videosWithoutClues -= 1;
              if (!beforeWithoutClues && video.sampleClueHits < minVideoLeadClues) filterStats.videosWithoutClues += 1;
            } catch (error) {
              // 扩展抽样是增强步骤，失败时保留第一页结果，不让单个候选
              // 的二次请求影响整个找客任务。
              filterStats.sampleExpansionFailed += 1;
            }
          }
        } catch (error) {
          metrics.commentFailed += 1;
          video.sampleComments = [];
          video.sampleCommentCount = 0;
          video.sampleRecentCount = 0;
          video.sampleClueHits = 0;
          video.sampleHighIntentHits = 0;
          video.sampleSignalPoints = 0;
          video.sampleClueTerms = [];
          video.leadDensity = 0;
          video.qualityScore = Math.round(video.metadataScore * 0.48 * 10) / 10;
          video.qualityReason = `评论抽样失败：${error.message}`;
          video.sampleError = error.message;
        } finally {
          metrics.commentMs += Date.now() - startedAt;
          completedSamples += 1;
          report(34 + Math.round((completedSamples / Math.max(sampledCandidates.length, 1)) * 20),
            `视频质量抽样 ${completedSamples}/${sampledCandidates.length}，发现 ${filterStats.sampleClueHits} 条需求线索`, {
              phase: 'video-sampling', current: completedSamples, total: sampledCandidates.length,
            });
        }
      });

        const contextCheckedCandidates = relayCampaign
        ? sampledCandidates.filter(video => hasModelApiServiceContext(video))
        : sampledCandidates;
      filterStats.videosWrongTopic = sampledCandidates.length - contextCheckedCandidates.length;
      if (filterStats.videosWrongTopic > 0) {
        warnings.push(`已排除 ${filterStats.videosWrongTopic} 个缺少模型/API 语境的视频，避免把旅游“中转站”等无关内容当线索`);
      }
      contextCheckedCandidates.sort((a, b) => b.qualityScore - a.qualityScore);
      const selectedVideos = contextCheckedCandidates
        .filter(video => video.sampleRecentCount > 0 && video.sampleClueHits >= minVideoLeadClues)
        .slice(0, videoCount);
      if (sampledCandidates.length > 0 && selectedVideos.length === 0) {
        warnings.push(`抽样视频中没有发现至少 ${minVideoLeadClues} 条近期需求线索；本轮未使用低质量视频`);
      } else if (selectedVideos.length < videoCount && sampledCandidates.length > selectedVideos.length) {
        warnings.push(`质量筛选后仅保留 ${selectedVideos.length}/${videoCount} 个视频，其余视频缺少近期需求线索`);
      }

      report(55, `质量筛选保留 ${selectedVideos.length}/${videoCount} 个视频，开始抓取目标评论`, {
        phase: 'comment-fetch', current: 0, total: selectedVideos.length,
      });

      // 抓取最终评论；样本已覆盖用户请求时直接复用，避免重复请求。
      let completedFetches = 0;
      await mapLimit(selectedVideos, COMMENT_FETCH_CONCURRENCY, async (video, index) => {
        videos.upsert({ awemeId: video.awemeId, title: video.title, authorUid: video.authorUid });
        const startedAt = Date.now();
        const canReuseSample = commentsPerVideo > 0 && commentsPerVideo <= sampleCommentsPerVideo;
        if (!canReuseSample) metrics.commentCalls += 1;
        report(55 + Math.round((completedFetches / Math.max(selectedVideos.length, 1)) * 15),
          `正在抓取视频 ${index + 1}/${selectedVideos.length} 的评论`, {
            phase: 'comment-fetch', current: completedFetches, total: selectedVideos.length,
          });
        try {
          let fetched;
          if (canReuseSample) {
            // 抽样阶段已经拿到了同一批评论；先把有需求信号的评论排到前面，
            // 再按“每视频评论”截断。旧逻辑直接 slice(0, N)，会把第 6 条
            // 才出现的“没抢到/求票”漏掉，造成结果区看起来像没有评论。
            const videoContext = relayCampaign
              ? String(video.title || '')
              : `${video.title || ''} ${video.sourceKeyword || ''}`;
            const rankedSample = [...(video.sampleComments || [])].sort((a, b) => {
              const aSignal = scoreCampaignSignal(a.text, commentKeywords, videoContext, relayCampaign);
              const bSignal = scoreCampaignSignal(b.text, commentKeywords, videoContext, relayCampaign);
              if (Number(bSignal.qualifies) !== Number(aSignal.qualifies)) {
                return Number(bSignal.qualifies) - Number(aSignal.qualifies);
              }
              if (bSignal.signalPoints !== aSignal.signalPoints) {
                return bSignal.signalPoints - aSignal.signalPoints;
              }
              return 0;
            });
            fetched = commentsPerVideo > 0
              ? rankedSample.slice(0, commentsPerVideo)
              : rankedSample;
          } else {
            fetched = (await this._fetchComments(video.awemeId, commentsPerVideo, executionContext))
              .map(normalizeCampaignComment)
              .filter(comment => comment.cid);
          }
          filterStats.commentsFetched += fetched.length;
          video.rawCommentCount = fetched.length;
          video.eligibleComments = [];
          video.previouslyRepliedComments = [];
          for (const comment of fetched) {
            if (!comment.text) {
              filterStats.commentsWithoutText += 1;
              continue;
            }
            if (!isWithinDays(comment.time, commentTimeRangeDays)) {
              filterStats.commentsTooOld += 1;
              continue;
            }
            const matched = matchKeywords(comment.text, commentKeywords);
            if (commentKeywords.length && matched.length === 0) {
              filterStats.commentsKeywordMiss += 1;
              continue;
            }
            comment.matchedKeywords = matched;
            const storedComment = comments.get(comment.cid);
            if (storedComment?.replied) {
              comment.replied = true;
              video.previouslyRepliedComments.push(comment);
              filterStats.previouslyReplied += 1;
              continue;
            }
            // 评论 cid 每次都不同，但用户 uid 是稳定的。只按 cid 去重会让
            // 同一个人换一条评论后再次进入筛选；users.reply_count 记录了
            // 历史已回复用户，因此这里增加用户级安全门。
            const userUid = comment.user?.uid || storedComment?.uid || '';
            let repliedUser = null;
            if (userUid) {
              const normalizedUid = String(userUid);
              if (!repliedUserCache.has(normalizedUid)) repliedUserCache.set(normalizedUid, users.get(normalizedUid));
              repliedUser = repliedUserCache.get(normalizedUid);
            }
            if (repliedUser?.replyCount > 0) {
              comment.replied = true;
              comment.repliedUser = true;
              video.previouslyRepliedComments.push(comment);
              filterStats.previouslyReplied += 1;
              if (!repliedUserIds.has(String(userUid))) {
                repliedUserIds.add(String(userUid));
                filterStats.previouslyRepliedUsers += 1;
              }
              continue;
            }
            const signal = scoreCampaignSignal(
              comment.text,
              commentKeywords,
              relayCampaign ? String(video.title || '') : `${video.title || ''} ${video.sourceKeyword || ''}`,
              relayCampaign,
            );
            comment.leadSignal = {
              matched: signal.matched,
              highIntentHits: signal.highIntentHits,
              mediumIntentHits: signal.mediumIntentHits,
              signalPoints: signal.signalPoints,
              hasContext: signal.hasContext,
            };
            // 开启 AI 时也先做一层轻量语境过滤，避免把整页“唱得好看”
            // 之类的泛评论交给模型；明确的手动关键词仍按用户输入放行。
            if ((relayCampaign || !commentKeywords.length) && !signal.qualifies) {
              filterStats.commentsSignalMiss += 1;
              continue;
            }
            video.eligibleComments.push(comment);
            filterStats.eligible += 1;
          }
        } catch (error) {
          metrics.commentFailed += 1;
          video.eligibleComments = [];
          video.previouslyRepliedComments = [];
          video.rawCommentCount = 0;
          video.fetchError = error.message || '评论抓取失败';
        } finally {
          if (!canReuseSample) metrics.commentMs += Date.now() - startedAt;
          completedFetches += 1;
          report(55 + Math.round((completedFetches / Math.max(selectedVideos.length, 1)) * 15),
            `评论抓取 ${completedFetches}/${selectedVideos.length}，初筛剩余 ${filterStats.eligible} 条`, {
              phase: 'comment-fetch', current: completedFetches, total: selectedVideos.length,
            });
        }
      });

      // AI 精筛分批执行。失败批次安全跳过，绝不因为模型失败而误回复全部评论。
      const intentTasks = [];
      for (const video of selectedVideos) {
        video.qualifiedComments = [];
        video.reviewComments = [];
        for (let offset = 0; offset < (video.eligibleComments || []).length; offset += INTENT_BATCH_SIZE) {
          intentTasks.push({ video, items: video.eligibleComments.slice(offset, offset + INTENT_BATCH_SIZE) });
        }
      }
      if (aiFilterEnabled && intentTasks.length > 0) {
        let completedIntent = 0;
        await mapLimit(intentTasks, INTENT_CONCURRENCY, async (task) => {
          const startedAt = Date.now();
          metrics.aiCalls += 1;
          report(71 + Math.round((completedIntent / intentTasks.length) * 13),
            `AI 正在精准判定第 ${completedIntent + 1}/${intentTasks.length} 批评论`, {
              phase: 'intent-analysis', current: completedIntent, total: intentTasks.length,
            });
          try {
            const prompt = buildIntentPrompt({
              targetCustomer: keyword,
              video: task.video,
              comments: task.items,
              threshold: intentThreshold,
            });
            const llm = this._getLlm();
            const raw = await llm.complete([
              { role: 'system', content: prompt.systemPrompt },
              { role: 'user', content: prompt.userPrompt },
            ], 0.1, { maxRetries: 2, timeoutMs: 45_000 });
            const parsed = llm.extractJSON(raw);
            const list = Array.isArray(parsed)
              ? parsed
              : Array.isArray(parsed?.results) ? parsed.results
                : Array.isArray(parsed?.items) ? parsed.items : [];
            const byCid = new Map(list.map(item => [String(item?.cid || ''), item]));
            for (const comment of task.items) {
              const analysis = normalizeIntentResult(byCid.get(comment.cid) || {}, comment.cid, intentThreshold);
              comments.setAnalysis(comment.cid, {
                sentiment: analysis.sentiment,
                priority: analysis.priority,
                isTarget: analysis.isTarget,
                intentScore: analysis.intentScore,
                intentLabel: analysis.intentLabel,
                intentStage: analysis.intentStage,
                intentReason: analysis.intentReason,
              });
              if (analysis.isTarget && analysis.intentScore >= intentThreshold) {
                task.video.qualifiedComments.push({ ...comment, ...analysis, isQualified: true });
                filterStats.qualified += 1;
              }
            }
          } catch (error) {
            metrics.aiFailed += 1;
            const reviewComments = task.items.map(comment => ({
              ...comment,
              isQualified: false,
              needsReview: true,
              intentLabel: '待人工复核',
              intentReason: `AI 暂时不可用：${String(error.message || '请求失败').slice(0, 120)}`,
            }));
            task.video.reviewComments.push(...reviewComments);
            filterStats.aiFallbackComments += reviewComments.length;
            warnings.push(`视频 ${task.video.awemeId.slice(0, 8)} 的 AI 判定失败，已转为人工复核，不会自动回复：${error.message}`);
          } finally {
            metrics.aiMs += Date.now() - startedAt;
            completedIntent += 1;
            report(71 + Math.round((completedIntent / intentTasks.length) * 13),
              `AI 判定 ${completedIntent}/${intentTasks.length}，确认高意向 ${filterStats.qualified} 条`, {
                phase: 'intent-analysis', current: completedIntent, total: intentTasks.length,
              });
          }
        });
      } else {
        for (const video of selectedVideos) {
          video.qualifiedComments = (video.eligibleComments || []).map(comment => ({
            ...comment,
            isQualified: true,
            intentLabel: commentKeywords.length ? '关键词匹配' : '线索规则命中',
            intentReason: comment.matchedKeywords?.length
              ? `命中线索词：${comment.matchedKeywords.join('、')}`
              : `命中需求语境：${comment.leadSignal?.matched?.slice(0, 3).join('、') || '明确购买动作'}`,
          }));
          filterStats.qualified += video.qualifiedComments.length;
        }
      }

      // 一个客户可能在不同视频下留下多条评论。结果全部保留作证据，
      // 但后续回复/私信只保留该用户意向最强的一条，避免同一轮重复触达。
      const leadByUser = new Map();
      const leadRank = comment => [
        Number(comment.intentScore || 0),
        Number(comment.leadSignal?.signalPoints || 0),
        Number(comment.likes || 0),
        unixSeconds(comment.time),
      ];
      const compareLead = (left, right) => {
        const a = leadRank(left);
        const b = leadRank(right);
        for (let index = 0; index < a.length; index += 1) {
          if (a[index] !== b[index]) return a[index] - b[index];
        }
        return 0;
      };
      let anonymousLeadCount = 0;
      for (const video of selectedVideos) {
        for (const comment of video.qualifiedComments || []) {
          const uid = String(comment.user?.uid || comment.uid || '').trim();
          const key = uid ? `uid:${uid}` : `cid:${comment.cid}`;
          if (!uid) anonymousLeadCount += 1;
          const existing = leadByUser.get(key);
          if (!existing) {
            comment.leadPrimary = true;
            leadByUser.set(key, { video, comment });
            continue;
          }
          if (compareLead(comment, existing.comment) > 0) {
            existing.comment.leadPrimary = false;
            existing.comment.leadDuplicate = true;
            comment.leadPrimary = true;
            leadByUser.set(key, { video, comment });
          } else {
            comment.leadPrimary = false;
            comment.leadDuplicate = true;
          }
        }
      }
      filterStats.uniqueLeads = leadByUser.size;
      filterStats.duplicateLeads = Math.max(0, filterStats.qualified - leadByUser.size);
      const leadStats = {
        unique: leadByUser.size,
        qualifiedComments: filterStats.qualified,
        duplicateComments: filterStats.duplicateLeads,
        anonymousComments: anonymousLeadCount,
      };
      if (filterStats.duplicateLeads > 0) {
        warnings.push(`发现 ${filterStats.duplicateLeads} 条重复客户评论，动作只保留每位客户意向最强的一条`);
      }

      for (const video of selectedVideos) {
        video.comments = [
          ...(video.qualifiedComments || []),
          ...(video.reviewComments || []),
          ...(video.previouslyRepliedComments || []),
        ];
        video.commentCount = video.comments.length;
        video.qualifiedCommentCount = (video.qualifiedComments || []).length;
        video.uniqueLeadCount = (video.qualifiedComments || []).filter(comment => comment.leadPrimary).length;
      }

      // 回复前再次查库并加进程锁，解决历史任务和并发任务的重复回复。
      const replyStats = { target: 0, succeeded: 0, failed: 0, skipped: 0 };
      const draftStats = { target: 0, saved: 0, skipped: 0, failed: 0 };
      if (replyText) {
        const totalComments = selectedVideos.reduce((sum, video) => sum + (video.comments || [])
          .filter(comment => !comment.needsReview && !comment.leadDuplicate).length, 0);
        let repliedSoFar = 0;
        for (const video of selectedVideos) {
          video.replies = [];
          for (const comment of video.comments || []) {
            if (comment.needsReview) {
              video.replies.push({ cid: comment.cid, status: 'skipped', message: 'AI 暂时不可用，待人工复核' });
              continue;
            }
            if (comment.leadDuplicate) {
              video.replies.push({ cid: comment.cid, status: 'skipped', message: '同一客户已保留更强线索' });
              continue;
            }
            repliedSoFar += 1;
            if (deliveryMode === 'draft') draftStats.target += 1;
            else replyStats.target += 1;
            const progress = 85 + Math.round((repliedSoFar / Math.max(totalComments, 1)) * 13);
            if (comment.replied || comments.get(comment.cid)?.replied) {
              if (deliveryMode === 'draft') draftStats.skipped += 1;
              else replyStats.skipped += 1;
              video.replies.push({
                cid: comment.cid,
                status: 'skipped',
                message: comment.repliedUser ? '该用户此前已回复过' : '此前已回复过',
              });
              report(progress, `跳过已回复评论 ${repliedSoFar}/${totalComments}`, {
                phase: 'replying', current: repliedSoFar, total: totalComments,
              });
              continue;
            }
            if (deliveryMode === 'draft') {
              report(progress, `正在保存第 ${repliedSoFar}/${totalComments} 条待审核草稿`, {
                phase: 'drafting', current: repliedSoFar, total: totalComments,
              });
              try {
                const draftId = drafts.save({
                  awemeId: video.awemeId,
                  replyToCid: comment.cid,
                  text: replyText,
                });
                if (!draftId) throw new Error('草稿保存失败');
                comments.setAnalysis(comment.cid, { replyDraft: replyText });
                comment.replyDraft = replyText;
                draftStats.saved += 1;
                video.replies.push({ cid: comment.cid, status: 'drafted', draftId });
              } catch (error) {
                draftStats.failed += 1;
                video.replies.push({ cid: comment.cid, status: 'failed', message: error.message });
                warnings.push(`草稿 ${comment.cid} 保存失败：${error.message}`);
              }
              continue;
            }
            report(progress, `正在回复第 ${repliedSoFar}/${totalComments} 条高意向评论`, {
              phase: 'replying', current: repliedSoFar, total: totalComments,
            });
            const replyStartedAt = Date.now();
            metrics.replyCalls += 1;
            try {
              const published = await this._replyOnce(video.awemeId, comment.cid, replyText, executionContext);
              if (published.status === 'skipped') {
                replyStats.skipped += 1;
                video.replies.push({ cid: comment.cid, status: 'skipped', message: published.message });
              } else {
                replyStats.succeeded += 1;
                video.replies.push({ cid: comment.cid, status: 'replied' });
              }
            } catch (error) {
              metrics.replyFailed += 1;
              replyStats.failed += 1;
              video.replies.push({ cid: comment.cid, status: 'failed', message: error.message });
              warnings.push(`回复 ${comment.cid} 失败：${error.message}`);
            } finally {
              metrics.replyMs += Date.now() - replyStartedAt;
            }
          }
        }
      }

      // 私信动作只对明确开启且关闭人工审核的工作流执行；审核模式只统计待审核
      // 数量，避免用户启用规则后在不知情的情况下直接发私信。
      const dmStats = { target: 0, succeeded: 0, failed: 0, skipped: 0, alreadyMessaged: 0, pendingApproval: 0 };
      if (dmText) {
        const seenDmUsers = new Set();
        const dmAccountId = String(input.accountId || input.accountUid || `connection:${Number(input.connIndex || 0)}`);
        const dmCandidates = selectedVideos.flatMap(video => (video.qualifiedComments || [])
          .filter(comment => !comment.leadDuplicate)
          .map(comment => ({ video, comment })));
        for (const { comment } of dmCandidates) {
          const uid = String(comment.user?.uid || comment.uid || '').trim();
          if (!uid || seenDmUsers.has(uid)) { dmStats.skipped += 1; continue; }
          if (dmMemory.hasOutbound(dmAccountId, uid)) {
            dmStats.skipped += 1;
            dmStats.alreadyMessaged += 1;
            continue;
          }
          seenDmUsers.add(uid);
          if (seenDmUsers.size > dmLimit) { dmStats.skipped += 1; continue; }
          dmStats.target += 1;
          const nickname = comment.user?.nickname || '朋友';
          const renderedText = dmText.replace(/\{nickname\}/g, nickname);
          if (deliveryMode === 'draft') {
            dmStats.pendingApproval += 1;
            continue;
          }
          const startedAt = Date.now();
          metrics.dmCalls += 1;
          try {
            const sent = await executionContext.cmdDM([uid, renderedText]);
            users.upsert({ uid, nickname, seenAt: Date.now(), commentDelta: 0 });
            dmMemory.appendMessage({
              accountId: dmAccountId,
              conversationId: sent?.conversation_id || `peer:${uid}`,
              peerUid: uid,
              peerNickname: nickname,
              senderUid: input.accountUid || '',
              senderNickname: input.accountNickname || '',
              content: renderedText,
              direction: 'outbound',
              messageType: 'text',
              remoteId: `workflow:${Date.now()}:${crypto.randomUUID()}`,
              createdAt: Date.now(),
              status: 'sent',
            });
            dmStats.succeeded += 1;
          } catch (error) {
            dmStats.failed += 1;
            warnings.push(`私信 ${uid} 失败：${error.message}`);
          } finally {
            metrics.dmMs += Date.now() - startedAt;
          }
        }
        if (dmStats.pendingApproval > 0) warnings.push(`已生成 ${dmStats.pendingApproval} 条待审核私信，不会自动发送`);
        if (dmStats.alreadyMessaged > 0) warnings.push(`已跳过 ${dmStats.alreadyMessaged} 个已私信用户，避免重复触达`);
      }

      const selectedVideoIds = new Set(selectedVideos.map(video => video.awemeId));
      const resultVideos = selectedVideos.filter(video => (video.comments || []).length > 0);
      const resultVideoIds = new Set(resultVideos.map(video => video.awemeId));
      filterStats.videosWithoutFinalComments = selectedVideos.length - resultVideos.length;
      if (filterStats.videosWithoutFinalComments > 0) {
        warnings.push(`有 ${filterStats.videosWithoutFinalComments} 个视频通过抽样门槛，但完整评论/AI 复核后没有可展示的线索`);
      }
      const contextCheckedIds = new Set(contextCheckedCandidates.map(video => video.awemeId));
      const sampledVideoAudit = sampledCandidates.map(video => {
        let filterReason = '通过质量筛选';
        if (!contextCheckedIds.has(video.awemeId)) {
          filterReason = '视频标题和抽样评论缺少目标模型/API语境';
        } else if (video.sampleRecentCount === 0) {
          filterReason = commentTimeRangeDays
            ? `抽样评论中没有最近 ${commentTimeRangeDays} 天的评论`
            : '抽样评论中没有可用的近期文本';
        } else if (video.sampleClueHits < minVideoLeadClues) {
          filterReason = `最近评论样本中只有 ${video.sampleClueHits} 条明确需求信号，门槛为 ${minVideoLeadClues} 条`;
        } else if (!selectedVideoIds.has(video.awemeId)) {
          filterReason = '有需求信号，但未进入本轮视频数量上限';
        } else if (video.fetchError) {
          filterReason = `完整评论抓取失败：${String(video.fetchError).slice(0, 100)}`;
        } else if (!resultVideoIds.has(video.awemeId) && (video.eligibleComments || []).length > 0 && aiFilterEnabled) {
          filterReason = `抽样有线索，但 AI 精筛后没有达到 ${intentThreshold} 分的评论`;
        } else if (!resultVideoIds.has(video.awemeId)) {
          filterReason = '完整评论复核后没有通过时效、关键词或重复触达检查的评论';
        }
        return {
          awemeId: video.awemeId,
          title: video.title,
          authorNickname: video.authorNickname,
          sourceKeyword: video.sourceKeyword,
          commentCount: Number(video.stats?.commentCount || 0),
          sampleCommentCount: video.sampleCommentCount || 0,
          sampleRecentCount: video.sampleRecentCount || 0,
          sampleClueHits: video.sampleClueHits || 0,
          sampleClueTerms: video.sampleClueTerms || [],
          leadDensity: video.leadDensity || 0,
          qualityPassed: selectedVideoIds.has(video.awemeId),
          selected: resultVideoIds.has(video.awemeId),
          filterReason,
        };
      });

      report(100, '精准找客流程完成', { phase: 'completed', current: 1, total: 1 });
      return {
        keyword,
        manualKeywords,
        commentKeywords,
        keywords,
        searchBudget,
        searchedKeywords: completedKeywords,
        videoTimeRangeDays,
        commentTimeRangeDays,
        intentThreshold,
        aiFilterEnabled,
        qualityStrategy: {
          minVideoComments,
          sampleCommentsPerVideo,
          minVideoLeadClues,
          clueSource: commentKeywords.length ? 'manual' : 'built-in',
        },
        candidatePoolSize: candidatePool.length,
        leadStats,
        deliveryMode,
        qualityPassedVideoCount: selectedVideos.length,
        videoCount: resultVideos.length,
        commentsPerVideo,
        replyText: replyText || null,
        replyStats,
        draftStats,
        dmStats,
        filterStats,
        metrics,
        warnings,
        sampledVideoAudit,
        videos: resultVideos.map(video => ({
          awemeId: video.awemeId,
          title: video.title,
          authorNickname: video.authorNickname,
          createTime: video.createTime,
          stats: video.stats,
          sourceKeyword: video.sourceKeyword,
          metadataScore: video.metadataScore,
          qualityScore: video.qualityScore,
          qualityReason: video.qualityReason,
          sampleCommentCount: video.sampleCommentCount || 0,
          sampleRecentCount: video.sampleRecentCount || 0,
          sampleClueHits: video.sampleClueHits || 0,
          sampleHighIntentHits: video.sampleHighIntentHits || 0,
          sampleSignalPoints: video.sampleSignalPoints || 0,
          sampleClueTerms: video.sampleClueTerms || [],
          titleRelevanceScore: video.titleRelevanceScore || 0,
          leadDensity: video.leadDensity || 0,
          rawCommentCount: video.rawCommentCount || 0,
          commentCount: video.commentCount,
          qualifiedCommentCount: video.qualifiedCommentCount || 0,
          uniqueLeadCount: video.uniqueLeadCount || 0,
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
      hasDraft: opts.hasDraft,
      targetOnly: opts.targetOnly,
    });
  }
}

module.exports = {
  AppController,
  createCommandContext,
  normalizeSearchItem,
  normalizeCampaignComment,
  isModelApiRelayCampaign,
  hasModelApiServiceContext,
  scoreModelApiRelaySignal,
};

#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const paths = require('../lib/paths.js');
const HERE = fileURLToPath(new URL('.', import.meta.url));

function resolveBaseUrl() {
  const config = paths.readConfig();
  const configuredPort = Number(config.bridge?.port) || 19422;
  const raw = process.env.COMMENT_CONSOLE_APP_URL || `http://127.0.0.1:${configuredPort}`;
  const url = new URL(raw);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new Error('MCP 只允许连接本机 Comment Console 服务');
  }
  return url.origin;
}

const BASE_URL = resolveBaseUrl();
let appCookie = '';

function sanitizedError(error) {
  return String(error?.message || '本地工作台请求失败')
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, '[API Key 已隐藏]')
    .replace(/[A-Fa-f0-9]{40,}/g, '[本机凭证已隐藏]')
    .slice(0, 500);
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 10000);
  try {
    const { timeoutMs: _timeoutMs, ...requestOptions } = options;
    return await fetch(url, { ...requestOptions, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function ensureAppSession() {
  const response = await fetchWithTimeout(`${BASE_URL}/app`, {
    headers: appCookie ? { Cookie: appCookie } : {},
  });
  if (!response.ok) throw new Error(`工作台未就绪（HTTP ${response.status}），请先运行 npm start 并打开网页工作台`);
  if (!appCookie) {
    const cookies = response.headers.getSetCookie?.() || [];
    const cookie = cookies.find(value => value.startsWith('app_session=')) || response.headers.get('set-cookie') || '';
    appCookie = cookie.split(';', 1)[0];
  }
  if (!appCookie) throw new Error('未能建立本机工作台会话，请先在浏览器打开本机工作台后重试');
}

async function appApi(route, options = {}, canRetry = true) {
  if (!String(route).startsWith('/api/app/')) throw new Error('MCP 请求路由无效');
  await ensureAppSession();
  const headers = { Cookie: appCookie, Accept: 'application/json', ...(options.headers || {}) };
  let body;
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  const response = await fetchWithTimeout(`${BASE_URL}${route}`, {
    method: options.method || 'GET',
    headers,
    body,
    timeoutMs: options.timeoutMs || 15000,
  });
  if (response.status === 401 && canRetry) {
    appCookie = '';
    return appApi(route, options, false);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || payload.message || `工作台请求失败（HTTP ${response.status}）`);
  return payload;
}

function success(value) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
  };
}

function failure(error) {
  return { content: [{ type: 'text', text: sanitizedError(error) }], isError: true };
}

async function runTool(handler, input) {
  try {
    return success(await handler(input));
  } catch (error) {
    return failure(error);
  }
}

function extractLeads(job) {
  const result = job?.result;
  if (!result || !Array.isArray(result.videos)) return [];
  return result.videos.flatMap(video => (video.comments || []).map(comment => ({
    jobId: job.id,
    awemeId: video.awemeId,
    videoTitle: video.title || '',
    cid: comment.cid,
    uid: comment.user?.uid || comment.uid || '',
    nickname: comment.user?.nickname || comment.nickname || '',
    text: comment.text || '',
    score: Number(comment.intentScore || 0),
    label: comment.intentLabel || '',
    reason: comment.intentReason || '',
    stage: comment.intentStage || '',
    createdAt: comment.createTime || comment.createdAt || null,
    replied: Boolean(comment.replied),
    duplicate: Boolean(comment.leadDuplicate),
    needsReview: Boolean(comment.needsReview),
    isTarget: comment.isTarget === true || comment.isQualified === true,
  })));
}

function createServer() {
  const server = new McpServer({ name: 'comment-console', version: '1.0.0' });

  server.registerTool('comment_console_status', {
    title: 'Comment Console status',
    description: 'Read local Comment Console and Douyin bridge status. Does not publish or message anyone.',
    inputSchema: z.object({}),
  }, async () => runTool(async () => {
    const [session, overview] = await Promise.all([
      appApi('/api/app/douyin/session'),
      appApi('/api/app/overview'),
    ]);
    return { session: session.session, overview: overview.overview };
  }));

  server.registerTool('comment_console_list_accounts', {
    title: 'List connected Douyin accounts',
    description: 'List account names and connection/authentication status for the locally connected Douyin browser tabs.',
    inputSchema: z.object({ probe: z.boolean().default(false) }),
  }, async ({ probe }) => runTool(async () => {
    const query = probe ? '?probe=1' : '';
    const payload = await appApi(`/api/app/accounts${query}`);
    return { accounts: payload.accounts || [] };
  }));

  server.registerTool('comment_console_discover_customers', {
    title: 'Discover potential customers',
    description: 'Run a local Douyin discovery and AI-intent workflow. This tool only searches, fetches public comments, and classifies leads; it is hard-coded not to publish comments or send direct messages.',
    inputSchema: z.object({
      customerProfile: z.string().min(5).max(2000).describe('Who the target customer is and what concrete need they have.'),
      videoKeywords: z.array(z.string().min(1).max(100)).max(8).default([]),
      commentClues: z.array(z.string().min(1).max(100)).max(60).default([]),
      videoCount: z.number().int().min(1).max(20).default(10),
      commentsPerVideo: z.number().int().min(0).max(100).default(50),
      videoAgeDays: z.number().int().min(0).max(365).default(180),
      commentAgeDays: z.number().int().min(1).max(365).default(30),
      minIntentScore: z.number().int().min(0).max(100).default(72),
      expandKeywords: z.boolean().default(true),
    }),
  }, async input => runTool(async () => {
    const payload = await appApi('/api/app/campaign/run', {
      method: 'POST',
      timeoutMs: 15000,
      body: {
        keyword: input.customerProfile,
        manualKeywords: input.videoKeywords.join('\n'),
        commentKeywords: input.commentClues.join('\n'),
        videoCount: input.videoCount,
        commentsPerVideo: input.commentsPerVideo,
        videoTimeRangeDays: input.videoAgeDays,
        commentTimeRangeDays: input.commentAgeDays,
        keywordExpandEnabled: input.expandKeywords,
        keywordExpandCount: 8,
        aiFilterEnabled: true,
        intentThreshold: input.minIntentScore,
        minVideoComments: 5,
        sampleCommentsPerVideo: 20,
        minVideoLeadClues: 1,
        replyText: '',
        dmText: '',
        deliveryMode: 'draft',
      },
    });
    return { job: payload.job, sideEffects: { commentsPublished: 0, directMessagesSent: 0 } };
  }));

  server.registerTool('comment_console_list_jobs', {
    title: 'List recent workbench jobs',
    description: 'Read recent discovery, draft, reply, and messaging job statuses.',
    inputSchema: z.object({ limit: z.number().int().min(1).max(50).default(20), type: z.string().max(50).optional() }),
  }, async ({ limit, type }) => runTool(async () => {
    const query = new URLSearchParams({ limit: String(limit) });
    if (type) query.set('type', type);
    const payload = await appApi(`/api/app/jobs?${query.toString()}`);
    return { jobs: payload.jobs || [] };
  }));

  server.registerTool('comment_console_get_job', {
    title: 'Get task result',
    description: 'Read one task status and a compact list of AI-qualified leads with public comment evidence.',
    inputSchema: z.object({ jobId: z.string().uuid() }),
  }, async ({ jobId }) => runTool(async () => {
    const payload = await appApi(`/api/app/jobs/${encodeURIComponent(jobId)}`);
    const job = payload.job;
    const result = job?.result;
    if (!result) return { job: { id: job?.id, type: job?.type, status: job?.status, progress: job?.progress, message: job?.message } };
    const leads = extractLeads(job).filter(lead => lead.isTarget);
    return {
      job: { id: job.id, type: job.type, status: job.status, progress: job.progress, message: job.message },
      summary: {
        searches: result.metrics?.searchCalls || 0,
        candidatePool: result.candidatePoolSize || 0,
        videosReviewed: result.videoCount || 0,
        uniqueLeads: result.leadStats?.unique || 0,
        aiFailures: result.metrics?.aiFailed || 0,
        warnings: result.warnings || [],
        searchedKeywords: result.searchedKeywords || [],
        repliesPublished: result.replyStats?.succeeded || 0,
        directMessagesSent: result.dmStats?.succeeded || 0,
      },
      leads,
    };
  }));

  server.registerTool('comment_console_list_leads', {
    title: 'List saved qualified leads',
    description: 'Collect AI-qualified lead evidence from recent discovery jobs, deduplicated by comment ID and user ID. Does not contact leads.',
    inputSchema: z.object({
      limit: z.number().int().min(1).max(100).default(30),
      minIntentScore: z.number().int().min(0).max(100).default(70),
      includeReplied: z.boolean().default(false),
    }),
  }, async ({ limit, minIntentScore, includeReplied }) => runTool(async () => {
    const list = await appApi('/api/app/jobs?limit=50&type=campaign%3Arun');
    const jobs = (list.jobs || []).filter(job => job.status === 'succeeded').slice(0, 30);
    const detailed = await Promise.all(jobs.map(async job => {
      try { return (await appApi(`/api/app/jobs/${encodeURIComponent(job.id)}`)).job; }
      catch (_) { return null; }
    }));
    const candidates = detailed.flatMap(extractLeads)
      .filter(lead => lead.isTarget && lead.score >= minIntentScore && !lead.duplicate && (includeReplied || !lead.replied))
      .sort((a, b) => b.score - a.score || Number(b.createdAt || 0) - Number(a.createdAt || 0));
    const seenComments = new Set();
    const seenUsers = new Set();
    const unique = [];
    for (const lead of candidates) {
      if (!lead.cid || seenComments.has(lead.cid)) continue;
      if (lead.uid && seenUsers.has(lead.uid)) continue;
      seenComments.add(lead.cid);
      if (lead.uid) seenUsers.add(lead.uid);
      unique.push(lead);
      if (unique.length >= limit) break;
    }
    return { total: unique.length, leads: unique };
  }));

  server.registerTool('comment_console_draft_reply', {
    title: 'Create reply draft',
    description: 'Ask the local AI to create and save a reviewable reply draft for a specific public comment. This does not publish the reply.',
    inputSchema: z.object({
      awemeId: z.string().regex(/^\d{10,}$/),
      cid: z.string().min(1).max(100),
      targetCustomer: z.string().max(2000).optional(),
      tone: z.string().max(300).optional(),
      cta: z.string().max(500).optional(),
    }),
  }, async input => runTool(async () => {
    const payload = await appApi(`/api/app/comments/${encodeURIComponent(input.cid)}/draft`, {
      method: 'POST',
      timeoutMs: 20000,
      body: {
        aweme_id: input.awemeId,
        targetCustomer: input.targetCustomer,
        replyTone: input.tone,
        replyCta: input.cta,
      },
    });
    return { job: payload.job, published: false };
  }));

  return server;
}

if (Number.parseInt(process.versions.node, 10) < 20) {
  console.error('Comment Console MCP 需要 Node.js 20 或更高版本。');
  process.exit(1);
}

void serveStdio(createServer);
console.error(`[comment-console-mcp] stdio server ready (data=${paths.getDataDir() || HERE})`);

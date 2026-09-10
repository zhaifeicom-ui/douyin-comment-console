// lib/app/lead-prompts.js — 线索判定与回复草稿 Prompt
//
// 这组 Prompt 与 CLI 的普通情感分析分开：工作台关注的是“是不是目标客户、
// 需求处在哪个阶段、下一步应该怎么回复”，而不是只给评论贴情绪标签。

const fs = require('fs');
const path = require('path');
const { sanitizeComment } = require('../shared/sanitize');

const PROMPTS_DIR = path.join(__dirname, '..', '..', 'prompts');
const TEMPLATE_CACHE = new Map();

const LABELS = new Set(['高意向', '潜在意向', '低意向', '非目标', '不确定']);
const STAGES = new Set(['明确需求', '比较了解', '兴趣关注', '无明确需求', '不确定']);
const ACTIONS = new Set(['公开回复并引导私信', '先回答问题', '先建立信任', '暂不回复', '人工复核']);

function loadTemplate(name) {
  if (TEMPLATE_CACHE.has(name)) return TEMPLATE_CACHE.get(name);
  let template = null;
  try {
    const raw = fs.readFileSync(path.join(PROMPTS_DIR, name), 'utf8');
    const system = raw.match(/=== SYSTEM ===\r?\n([\s\S]*?)(?=\r?\n=== USER ===|$)/);
    const user = raw.match(/=== USER ===\r?\n([\s\S]*)$/);
    template = {
      system: system ? system[1].trim() : '',
      user: user ? user[1].trim() : raw.trim(),
    };
  } catch (_) {
    template = null;
  }
  TEMPLATE_CACHE.set(name, template);
  return template;
}

function render(template, vars) {
  return String(template || '').replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] ?? ''));
}

function formatVideoContext(video = {}) {
  const title = sanitizeComment(video.title || video.desc || '', 240);
  const briefing = sanitizeComment(video.briefing || '', 500);
  const author = sanitizeComment(video.authorNickname || video.author?.nickname || '', 80);
  const lines = [
    `视频标题/描述：${title || '暂无'}`,
    author ? `作者：${author}` : '',
    briefing && briefing !== title ? `视频摘要：${briefing}` : '',
  ].filter(Boolean);
  return lines.join('\n');
}

function formatComments(comments = []) {
  return comments.map(comment => ({
    cid: String(comment.cid || ''),
    用户昵称: sanitizeComment(comment.user?.nickname || comment.nickname || '', 80),
    评论内容: sanitizeComment(comment.text || '', 300),
    点赞数: Number(comment.digg ?? comment.likes ?? 0) || 0,
    评论时间: comment.createdAt || comment.time || null,
  }));
}

function buildIntentPrompt({
  targetCustomer = '',
  video = {},
  comments = [],
  threshold = 65,
  images = [],
} = {}) {
  const safeCustomer = sanitizeComment(targetCustomer, 1000) || '暂未提供明确画像，请根据评论本身谨慎判断';
  const safeComments = JSON.stringify(formatComments(comments));
  const vars = {
    TARGET_CUSTOMER: safeCustomer,
    VIDEO_CONTEXT: formatVideoContext(video),
    COMMENT_LIST_JSON: safeComments,
    INTENT_THRESHOLD: String(Math.max(0, Math.min(100, Number(threshold) || 65))),
  };
  const tpl = loadTemplate('lead-intent.md');
  if (tpl) {
    return {
      systemPrompt: render(tpl.system, vars),
      userPrompt: render(tpl.user, vars),
      images: Array.isArray(images) ? images : [],
    };
  }
  return {
    systemPrompt: '你是严格、克制的抖音评论线索分析师，只输出 JSON 数组。',
    userPrompt: `目标客户画像：${safeCustomer}\n\n${formatVideoContext(video)}\n\n` +
      `请对评论逐条判断是否为目标客户，意向分数达到 ${vars.INTENT_THRESHOLD} 才算目标客户。` +
      `输出字段：cid、is_target、intent_score、intent_label、intent_stage、evidence、reason、next_action。` +
      `评论：${safeComments}`,
    images: Array.isArray(images) ? images : [],
  };
}

function buildReplyPrompt({
  targetCustomer = '',
  video = {},
  comment = {},
  analysis = {},
  tone = '自然、真诚、简洁',
  cta = '必要时引导私信，不主动承诺未确认的价格、库存或服务结果',
  images = [],
} = {}) {
  const vars = {
    TARGET_CUSTOMER: sanitizeComment(targetCustomer, 1000) || '未提供',
    VIDEO_CONTEXT: formatVideoContext(video),
    COMMENT_JSON: JSON.stringify({
      cid: String(comment.cid || ''),
      用户昵称: sanitizeComment(comment.user?.nickname || comment.nickname || '', 80),
      评论内容: sanitizeComment(comment.text || '', 300),
    }),
    ANALYSIS_JSON: JSON.stringify({
      intent_score: Number(analysis.intentScore ?? analysis.intent_score ?? 0) || 0,
      intent_label: analysis.intentLabel || analysis.intent_label || '',
      intent_stage: analysis.intentStage || analysis.intent_stage || '',
      evidence: sanitizeComment(analysis.evidence || analysis.intentReason || '', 300),
      next_action: analysis.nextAction || '',
    }),
    REPLY_TONE: sanitizeComment(tone, 300) || '自然、真诚、简洁',
    REPLY_CTA: sanitizeComment(cta, 500),
  };
  const tpl = loadTemplate('lead-reply.md');
  if (tpl) {
    return {
      systemPrompt: render(tpl.system, vars),
      userPrompt: render(tpl.user, vars),
      images: Array.isArray(images) ? images : [],
    };
  }
  return {
    systemPrompt: '你是抖音账号运营者，只输出 JSON，不编造事实，不发送骚扰式营销话术。',
    userPrompt: `目标客户：${vars.TARGET_CUSTOMER}\n${vars.VIDEO_CONTEXT}\n` +
      `评论：${vars.COMMENT_JSON}\n判定：${vars.ANALYSIS_JSON}\n` +
      `语气：${vars.REPLY_TONE}\n行动：${vars.REPLY_CTA}\n` +
      '生成一条 8-45 字的公开回复，必要时给出一个自然的下一步。返回 {"reply":"...","goal":"...","risk":"low|medium|high"}。',
    images: Array.isArray(images) ? images : [],
  };
}

function clampScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function boolValue(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  if (typeof value === 'string') return /^(true|yes|1|是|目标|高|潜在)$/i.test(value.trim());
  return null;
}

function normalizeIntentResult(item = {}, cid = '', threshold = 65) {
  const score = clampScore(item.intent_score ?? item.intentScore ?? item.score ?? item.intent);
  const targetFlag = boolValue(item.is_target ?? item.isTarget ?? item.target);
  const isTarget = targetFlag == null ? score >= Number(threshold || 65) : targetFlag;
  const label = LABELS.has(item.intent_label || item.intentLabel)
    ? (item.intent_label || item.intentLabel)
    : score >= 80 ? '高意向' : score >= Number(threshold || 65) ? '潜在意向' : score >= 35 ? '低意向' : '非目标';
  const stage = STAGES.has(item.intent_stage || item.intentStage)
    ? (item.intent_stage || item.intentStage)
    : isTarget ? '兴趣关注' : '不确定';
  const action = ACTIONS.has(item.next_action || item.nextAction)
    ? (item.next_action || item.nextAction)
    : isTarget ? '人工复核' : '暂不回复';
  const reason = sanitizeComment(item.reason || item.evidence || item.intentReason || item.summary || '', 320);
  return {
    cid: String(item.cid || cid || ''),
    isTarget,
    intentScore: score,
    intentLabel: label,
    intentStage: stage,
    intentReason: reason,
    evidence: reason,
    nextAction: action,
    sentiment: item.sentiment || null,
    category: item.category || null,
    priority: Number.isFinite(Number(item.priority))
      ? Math.max(1, Math.min(5, Math.round(Number(item.priority))))
      : isTarget ? 5 : 2,
  };
}

function normalizeReplyResult(value = {}) {
  if (typeof value === 'string') return { reply: value.trim(), goal: '回答并建立联系', risk: 'medium' };
  const reply = sanitizeComment(value.reply || value.text || value.content || '', 1000).trim();
  return {
    reply,
    goal: sanitizeComment(value.goal || value.reply_goal || '', 100),
    risk: ['low', 'medium', 'high'].includes(value.risk) ? value.risk : 'medium',
  };
}

module.exports = {
  buildIntentPrompt,
  buildReplyPrompt,
  normalizeIntentResult,
  normalizeReplyResult,
  formatVideoContext,
};

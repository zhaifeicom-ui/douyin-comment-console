// lib/app/workflows.js — 本地自动化工作流存储
//
// 工作流是“找客 → 判定 → 动作”的可审计配置。先落在本地 JSON，方便用户回溯、
// 导出和迁移；真正的账号执行仍由 Bridge/油猴脚本完成，不把 Cookie 或 API Key 写进来。

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getStorageDir } = require('../paths');

const FILE = path.join(getStorageDir(), 'automation-workflows.json');
const MAX = 100;

const DEFAULTS = Object.freeze({
  status: 'draft',
  trigger: 'manual',
  scheduleMinutes: 30,
  searchKeywords: [],
  commentKeywords: [],
  accountIds: [],
  accountIndexes: [],
  actions: {
    like: false,
    follow: false,
    comment: false,
    dm: false,
  },
  commentTemplate: '',
  dmTemplate: '',
  replyMode: 'draft',
  requireApproval: true,
  limits: {
    commentsPerAccount: 10,
    dmsPerAccount: 5,
  },
  stats: {
    runCount: 0,
    leads: 0,
    drafts: 0,
    commentsSent: 0,
    dmsSent: 0,
    lastRunAt: null,
    lastJobId: null,
    lastError: null,
  },
});

function readAll() {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed.map(normalize) : [];
  } catch (_) {
    return [];
  }
}

function writeAll(items) {
  const dir = path.dirname(FILE);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(items.slice(0, MAX), null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, FILE);
}

function listify(value, max = 60, length = 120) {
  const source = Array.isArray(value) ? value : String(value || '').split(/[\n,，、;；]+/);
  const seen = new Set();
  const out = [];
  for (const item of source) {
    const text = String(item || '').trim().slice(0, length);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

function bool(value, fallback = false) {
  return value == null ? fallback : value === true || value === 'true' || value === 1;
}

function integer(value, min, max, fallback) {
  const n = Number(value);
  return Number.isInteger(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

function normalize(input = {}, previous = {}) {
  const actions = { ...DEFAULTS.actions, ...(previous.actions || {}), ...(input.actions || {}) };
  const limits = { ...DEFAULTS.limits, ...(previous.limits || {}), ...(input.limits || {}) };
  const stats = { ...DEFAULTS.stats, ...(previous.stats || {}), ...(input.stats || {}) };
  const status = ['draft', 'active', 'paused'].includes(input.status)
    ? input.status
    : (previous.status || DEFAULTS.status);
  const trigger = ['manual', 'schedule'].includes(input.trigger)
    ? input.trigger
    : (previous.trigger || DEFAULTS.trigger);
  const replyMode = input.replyMode === 'publish' ? 'publish' : (previous.replyMode || DEFAULTS.replyMode);
  const name = String(input.name ?? previous.name ?? '未命名工作流').trim().slice(0, 80) || '未命名工作流';
  return {
    id: String(input.id || previous.id || crypto.randomUUID()),
    name,
    description: String(input.description ?? previous.description ?? '').trim().slice(0, 300),
    status,
    trigger,
    scheduleMinutes: integer(input.scheduleMinutes ?? previous.scheduleMinutes, 5, 1440, DEFAULTS.scheduleMinutes),
    searchKeywords: listify(input.searchKeywords ?? previous.searchKeywords, 40),
    commentKeywords: listify(input.commentKeywords ?? previous.commentKeywords, 60),
    accountIds: listify(input.accountIds ?? previous.accountIds, 30, 80),
    accountIndexes: (Array.isArray(input.accountIndexes) ? input.accountIndexes : (previous.accountIndexes || []))
      .map(value => Number(value)).filter(Number.isInteger).map(value => Math.max(0, value)).slice(0, 30),
    actions: {
      like: bool(actions.like),
      follow: bool(actions.follow),
      comment: bool(actions.comment),
      dm: bool(actions.dm),
    },
    commentTemplate: String(input.commentTemplate ?? previous.commentTemplate ?? '').trim().slice(0, 1000),
    dmTemplate: String(input.dmTemplate ?? previous.dmTemplate ?? '').trim().slice(0, 1000),
    replyMode,
    // 自动化默认先生成草稿；只有明确选择发布并关闭审核门，才会进入发送阶段。
    requireApproval: input.requireApproval == null
      ? (previous.requireApproval == null ? DEFAULTS.requireApproval : !!previous.requireApproval)
      : !!input.requireApproval,
    limits: {
      commentsPerAccount: integer(limits.commentsPerAccount, 0, 200, DEFAULTS.limits.commentsPerAccount),
      dmsPerAccount: integer(limits.dmsPerAccount, 0, 100, DEFAULTS.limits.dmsPerAccount),
    },
    stats,
    createdAt: Number(input.createdAt || previous.createdAt || Date.now()),
    updatedAt: Date.now(),
  };
}

function validate(workflow) {
  if (!workflow.searchKeywords.length) throw new Error('至少填写一个视频搜索关键词');
  if (!workflow.accountIds.length && !workflow.accountIndexes.length) {
    throw new Error('至少选择一个抖音账号');
  }
  if (workflow.actions.comment && !workflow.commentTemplate) throw new Error('开启自动评论后需要填写评论模板');
  if (workflow.actions.dm && !workflow.dmTemplate) throw new Error('开启自动私信后需要填写私信模板');
  if (workflow.replyMode === 'publish' && workflow.requireApproval) {
    throw new Error('发布模式不能同时开启“需要人工审核”');
  }
  return workflow;
}

function create(input) {
  const item = validate(normalize(input));
  const items = readAll();
  items.unshift(item);
  writeAll(items);
  return item;
}

function get(id) {
  return readAll().find(item => item.id === String(id)) || null;
}

function list(options = {}) {
  const items = readAll();
  return options.status ? items.filter(item => item.status === options.status) : items;
}

function update(id, input = {}) {
  const items = readAll();
  const index = items.findIndex(item => item.id === String(id));
  if (index === -1) throw new Error('工作流不存在');
  const next = validate(normalize({ ...input, id: items[index].id }, items[index]));
  items[index] = next;
  writeAll(items);
  return next;
}

function toggle(id, active) {
  return update(id, { status: active === false ? 'paused' : 'active' });
}

function remove(id) {
  const items = readAll();
  const next = items.filter(item => item.id !== String(id));
  if (next.length === items.length) return false;
  writeAll(next);
  return true;
}

function recordRun(id, patch = {}) {
  const current = get(id);
  if (!current) return null;
  const stats = {
    ...current.stats,
    ...patch,
    runCount: Number(current.stats?.runCount || 0) + 1,
    lastRunAt: Date.now(),
  };
  return update(id, { stats });
}

module.exports = {
  FILE,
  DEFAULTS,
  normalize,
  validate,
  create,
  get,
  list,
  update,
  toggle,
  remove,
  recordRun,
};

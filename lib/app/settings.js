// lib/app/settings.js — 本地前端设置持久化
//
// 这里只保存抓取/判定配置，不保存 Bridge token 或 LLM API Key。

const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, '..', '..', 'storage', 'ui-settings.json');

const DEFAULT_SETTINGS = Object.freeze({
  commentTimeRangeDays: 2,
  maxCommentsPerVideo: 5,
  aiIntentEnabled: true,
  targetCustomer: '',
  intentThreshold: 65,
  intentAnalysisMode: 'text-only',
  replyTone: '自然、真诚、简洁',
  replyCta: '必要时引导私信，不主动承诺未确认的价格、库存或服务结果',
  searchVideoCount: 5,
  keywordExpandEnabled: true,
  keywordExpandCount: 10,
  defaultReplyText: '',
});

const TIME_RANGE_OPTIONS = Object.freeze([1, 2, 3, 7, 14, 30]);

function normalizeSettings(input = {}) {
  const days = Number(input.commentTimeRangeDays);
  const maxComments = Number(input.maxCommentsPerVideo);
  const targetCustomer = typeof input.targetCustomer === 'string'
    ? input.targetCustomer.trim().slice(0, 2000)
    : '';
  const intentThreshold = Number(input.intentThreshold);
  const intentAnalysisMode = ['text-only', 'screenshots'].includes(input.intentAnalysisMode)
    ? input.intentAnalysisMode
    : DEFAULT_SETTINGS.intentAnalysisMode;
  const replyTone = typeof input.replyTone === 'string'
    ? input.replyTone.trim().slice(0, 300)
    : DEFAULT_SETTINGS.replyTone;
  const replyCta = typeof input.replyCta === 'string'
    ? input.replyCta.trim().slice(0, 500)
    : DEFAULT_SETTINGS.replyCta;
  const searchVideoCount = Number(input.searchVideoCount);
  const keywordExpandCount = Number(input.keywordExpandCount);
  const defaultReplyText = typeof input.defaultReplyText === 'string'
    ? input.defaultReplyText.trim().slice(0, 2000)
    : '';

  return {
    commentTimeRangeDays: TIME_RANGE_OPTIONS.includes(days) ? days : DEFAULT_SETTINGS.commentTimeRangeDays,
    maxCommentsPerVideo: Number.isInteger(maxComments) && maxComments >= 0 && maxComments <= 10000
      ? maxComments
      : DEFAULT_SETTINGS.maxCommentsPerVideo,
    aiIntentEnabled: input.aiIntentEnabled !== false,
    targetCustomer,
    intentThreshold: Number.isInteger(intentThreshold) && intentThreshold >= 0 && intentThreshold <= 100
      ? intentThreshold
      : DEFAULT_SETTINGS.intentThreshold,
    intentAnalysisMode,
    replyTone: replyTone || DEFAULT_SETTINGS.replyTone,
    replyCta: replyCta || DEFAULT_SETTINGS.replyCta,
    searchVideoCount: Number.isInteger(searchVideoCount) && searchVideoCount >= 1 && searchVideoCount <= 20
      ? searchVideoCount
      : DEFAULT_SETTINGS.searchVideoCount,
    keywordExpandEnabled: input.keywordExpandEnabled !== false,
    keywordExpandCount: Number.isInteger(keywordExpandCount) && keywordExpandCount >= 2 && keywordExpandCount <= 30
      ? keywordExpandCount
      : DEFAULT_SETTINGS.keywordExpandCount,
    defaultReplyText,
  };
}

function loadSettings() {
  try {
    const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    return normalizeSettings(raw);
  } catch (_) {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(input) {
  const settings = normalizeSettings(input);
  const dir = path.dirname(SETTINGS_FILE);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${SETTINGS_FILE}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, SETTINGS_FILE);
  return settings;
}

module.exports = {
  DEFAULT_SETTINGS,
  TIME_RANGE_OPTIONS,
  SETTINGS_FILE,
  loadSettings,
  saveSettings,
  normalizeSettings,
};

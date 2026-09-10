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

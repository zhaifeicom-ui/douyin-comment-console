// lib/app/llm-settings.js — 前端模型配置、模型发现与连通性测试
//
// API Key 只在本机 Node 进程和 config.json 之间流转。返回给浏览器的配置
// 永远不包含完整密钥，避免密钥进入页面状态或日志。

const fs = require('fs');
const path = require('path');
const { LLMClient } = require('../llm');
const { getConfigPath } = require('../paths');

const CONFIG_FILE = getConfigPath();
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';

function loadRootConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch (_) {
    return {};
  }
}

function normalizeBaseUrl(value) {
  const text = String(value || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
  let url;
  try {
    url = new URL(text);
  } catch (_) {
    throw new Error('接口地址格式不正确，请填写完整的 http:// 或 https:// 地址');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('接口地址只支持 http:// 或 https://');
  }
  if (url.username || url.password) throw new Error('接口地址中不能包含账号或密码');
  return text.slice(0, 2048);
}

function maskApiKey(value) {
  const key = String(value || '');
  if (!key) return '';
  if (key.length <= 8) return '••••••••';
  return `${key.slice(0, 3)}••••${key.slice(-4)}`;
}

function inferProvider(baseUrl) {
  const text = String(baseUrl || '').toLowerCase();
  if (text.includes('anthropic.com')) return 'Anthropic';
  if (text.includes('openai.com')) return 'OpenAI';
  return 'OpenAI 兼容接口';
}

function getManagedConfig(root) {
  const saved = root.managed_service || {};
  return {
    baseUrl: process.env.COMMENT_CONSOLE_SERVICE_URL || saved.base_url || '',
    apiKey: process.env.COMMENT_CONSOLE_SERVICE_TOKEN || saved.access_token || '',
    model: process.env.COMMENT_CONSOLE_SERVICE_MODEL || saved.model || '',
  };
}

function getResolvedConfig(overrides = {}) {
  const root = loadRootConfig();
  const saved = root.llm || {};
  const mode = overrides.mode === 'managed' || (!overrides.mode && saved.mode === 'managed')
    ? 'managed'
    : 'custom';
  const managed = getManagedConfig(root);
  if (mode === 'managed') {
    if (!managed.baseUrl) throw new Error('平台模型服务尚未开放，请先选择“使用自己的 API”');
    return {
      mode,
      apiKey: managed.apiKey,
      baseUrl: normalizeBaseUrl(managed.baseUrl),
      model: String(overrides.model || managed.model || DEFAULT_MODEL).trim().slice(0, 300),
      maxTokens: Number(saved.max_tokens) || 4096,
      timeoutMs: Number(saved.timeout_ms) || 60000,
      maxRetries: Number(saved.max_retries) || 3,
    };
  }
  const suppliedKey = typeof overrides.apiKey === 'string' ? overrides.apiKey.trim() : '';
  return {
    mode,
    apiKey: suppliedKey || process.env.OPENAI_API_KEY || saved.api_key || '',
    baseUrl: normalizeBaseUrl(overrides.baseUrl || process.env.OPENAI_BASE_URL || saved.base_url || DEFAULT_BASE_URL),
    model: String(overrides.model || process.env.OPENAI_MODEL || saved.model || DEFAULT_MODEL).trim().slice(0, 300),
    maxTokens: Number(saved.max_tokens) || 4096,
    timeoutMs: Number(saved.timeout_ms) || 60000,
    maxRetries: Number(saved.max_retries) || 3,
  };
}

function getPublicConfig() {
  const root = loadRootConfig();
  const saved = root.llm || {};
  const managed = getManagedConfig(root);
  const mode = saved.mode === 'managed' && managed.baseUrl ? 'managed' : 'custom';
  const resolved = getResolvedConfig({ mode });
  const fromEnvironment = Boolean(process.env.OPENAI_API_KEY || process.env.OPENAI_BASE_URL || process.env.OPENAI_MODEL);
  return {
    baseUrl: resolved.baseUrl,
    model: resolved.model,
    provider: inferProvider(resolved.baseUrl),
    apiKeyConfigured: Boolean(resolved.apiKey),
    apiKeyMasked: maskApiKey(resolved.apiKey),
    source: fromEnvironment ? 'environment' : 'config',
    mode,
    managedAvailable: Boolean(managed.baseUrl),
    managedLabel: root.managed_service?.label || 'Comment Console 平台服务',
  };
}

function saveConfig(input = {}) {
  if (process.env.OPENAI_API_KEY || process.env.OPENAI_BASE_URL || process.env.OPENAI_MODEL) {
    throw new Error('当前模型配置由环境变量控制，请先移除 OPENAI_API_KEY / OPENAI_BASE_URL / OPENAI_MODEL 后再从前端修改');
  }

  const root = loadRootConfig();
  const previous = root.llm || {};
  const requestedMode = input.mode === 'managed' ? 'managed' : 'custom';
  const managed = getManagedConfig(root);
  if (requestedMode === 'managed' && !managed.baseUrl) {
    throw new Error('平台模型服务尚未开放，请暂时选择“使用自己的 API”');
  }
  const baseUrl = normalizeBaseUrl(input.baseUrl || previous.base_url || DEFAULT_BASE_URL);
  const model = String(input.model || previous.model || '').trim().slice(0, 300);
  if (!model) throw new Error('请选择或填写一个模型');

  let apiKey = previous.api_key || '';
  if (input.clearApiKey === true) apiKey = '';
  if (typeof input.apiKey === 'string' && input.apiKey.trim()) apiKey = input.apiKey.trim().slice(0, 4096);

  root.llm = {
    ...previous,
    mode: requestedMode,
    api_key: apiKey,
    base_url: baseUrl,
    model,
  };

  const tmp = `${CONFIG_FILE}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(root, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, CONFIG_FILE);
  const runtime = requestedMode === 'managed'
    ? {
      ...root.llm,
      api_key: managed.apiKey,
      base_url: normalizeBaseUrl(managed.baseUrl),
      model: managed.model || model,
    }
    : root.llm;
  return { internal: runtime, public: getPublicConfig() };
}

function providerHeaders(config) {
  if (config.baseUrl.toLowerCase().includes('anthropic.com')) {
    return {
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    };
  }
  if (config.baseUrl.toLowerCase().includes('xiaomimimo.com')) {
    return { 'api-key': config.apiKey };
  }
  return { Authorization: `Bearer ${config.apiKey}` };
}

async function readError(response) {
  const payload = await response.json().catch(() => null);
  return payload?.error?.message || payload?.message || `${response.status} ${response.statusText}`;
}

async function fetchModels(input = {}) {
  const config = getResolvedConfig(input);
  if (!config.apiKey) throw new Error('请先填写 API Key');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(config.timeoutMs, 20000));
  try {
    const response = await fetch(`${config.baseUrl}/models`, {
      headers: { Accept: 'application/json', ...providerHeaders(config) },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`获取模型失败：${await readError(response)}`);
    const payload = await response.json();
    const rows = Array.isArray(payload?.data) ? payload.data
      : Array.isArray(payload?.models) ? payload.models
        : Array.isArray(payload) ? payload : [];
    const models = [...new Set(rows.map(item => String(item?.id || item?.name || item || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
    if (!models.length) throw new Error('接口连接成功，但没有返回可选择的模型');
    return { models, provider: inferProvider(config.baseUrl) };
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('获取模型超时，请检查接口地址或网络');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function testConnection(input = {}) {
  const config = getResolvedConfig(input);
  if (!config.apiKey) throw new Error('请先填写 API Key');
  if (!config.model) throw new Error('请先选择或填写模型');
  const startedAt = Date.now();
  const client = new LLMClient({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.model,
    maxTokens: 128,
    timeoutMs: Math.min(config.timeoutMs, 30000),
    maxRetries: 1,
  });
  const reply = await client.complete([
    { role: 'system', content: 'This is a real API connection test. Reply naturally and briefly to the user.' },
    { role: 'user', content: 'hi' },
  ], 0.2);
  return {
    model: config.model,
    provider: inferProvider(config.baseUrl),
    latencyMs: Date.now() - startedAt,
    request: 'hi',
    reply: String(reply || '').trim().slice(0, 500),
  };
}

module.exports = {
  CONFIG_FILE,
  normalizeBaseUrl,
  maskApiKey,
  getResolvedConfig,
  getPublicConfig,
  saveConfig,
  fetchModels,
  testConnection,
};

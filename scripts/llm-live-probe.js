#!/usr/bin/env node

const config = require('../config.json').llm || {};

async function main() {
  const startedAt = Date.now();
  const response = await fetch(`${String(config.base_url || '').replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.api_key || ''}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: '你是抖音关键词扩展助手，只输出合法 JSON。' },
        {
          role: 'user',
          content: '请基于客户关键词“想购买演唱会门票的人”生成 10 个简短、口语化、适合搜索潜在客户的衍生关键词，覆盖同义表达、场景、痛点和问题式短语。只输出 JSON，格式：{"keywords":["关键词1","关键词2"]}。',
        },
      ],
      temperature: 0.6,
      max_tokens: Number(config.max_tokens) || 4096,
    }),
    signal: AbortSignal.timeout(Number(config.timeout_ms) || 60000),
  });

  const text = await response.text();
  let result = text.slice(0, 2000);
  try {
    const json = JSON.parse(text);
    result = {
      error: json.error || null,
      model: json.model || null,
      content: json.choices?.[0]?.message?.content || null,
      usage: json.usage || null,
    };
  } catch (_) {}

  console.log(JSON.stringify({
    status: response.status,
    ok: response.ok,
    durationMs: Date.now() - startedAt,
    requestedModel: config.model,
    result,
  }, null, 2));
  if (!response.ok) process.exitCode = 2;
}

main().catch(error => {
  console.error(JSON.stringify({ error: error.message }, null, 2));
  process.exitCode = 3;
});

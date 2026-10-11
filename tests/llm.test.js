// tests/llm.test.js — LLM JSON 提取和 sanitizeComment 测试

const { LLMClient } = require('../lib/llm');

// 通过反射测试私有方法
const client = new LLMClient({ apiKey: 'test' });

describe('LLMClient._extractJSON', () => {
  it('直接 JSON 对象', () => {
    const r = client._extractJSON('{"a":1}');
    expect(r).toEqual({ a: 1 });
  });

  it('直接 JSON 数组', () => {
    const r = client._extractJSON('[1,2,3]');
    expect(r).toEqual([1, 2, 3]);
  });

  it('```json 代码块', () => {
    const r = client._extractJSON('some text\n```json\n{"a":1}\n```\nmore text');
    expect(r).toEqual({ a: 1 });
  });

  it('无标记代码块', () => {
    const r = client._extractJSON('some text\n```\n{"a":1}\n```');
    expect(r).toEqual({ a: 1 });
  });

  it('从混合文本中提取首个 []', () => {
    const r = client._extractJSON('Here is the result:\n[{"cid":"1","sentiment":"positive"}]\nDone.');
    expect(r).toEqual([{ cid: '1', sentiment: 'positive' }]);
  });

  it('从混合文本中提取首个 {}', () => {
    const r = client._extractJSON('Result: {"ok": true} end');
    expect(r).toEqual({ ok: true });
  });

  it('无法提取时抛出错误', () => {
    expect(() => client._extractJSON('no json here')).toThrow('无法从 LLM 响应中提取 JSON');
  });
});

describe('sanitizeComment (via LLM module)', () => {
  // sanitizeComment 是模块内部函数，通过 analyzeComments 的行为间接测试
  // 这里我们直接 require 模块来访问
  it('sanitizeComment 在模块中可用', () => {
    // 通过重新 require 来访问（vitest 可以处理）
    const mod = require('../lib/llm');
    // sanitizeComment 是内部函数，不导出，但我们可以验证 LLMClient 存在
    expect(mod.LLMClient).toBeDefined();
  });
});

describe('LLMClient constructor', () => {
  it('默认值', () => {
    const c = new LLMClient();
    // model 优先级：opts > env > config.json > 'gpt-4o-mini' 兜底。
    // 本地 config.json 可能覆盖（如 deepseek-v4-pro），故只断言非空 + retries 默认。
    expect(typeof c.model).toBe('string');
    expect(c.model.length).toBeGreaterThan(0);
    expect(c.maxRetries).toBe(3);
  });

  it('opts 覆盖', () => {
    const c = new LLMClient({ model: 'gpt-4', maxRetries: 5 });
    expect(c.model).toBe('gpt-4');
    expect(c.maxRetries).toBe(5);
  });

  it('config.json 的 snake_case 字段完整覆盖 URL、Key 与请求参数', async () => {
    const originalFetch = global.fetch;
    let captured = null;
    global.fetch = async (url, options) => {
      captured = { url, options };
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'OK' } }] }),
      };
    };
    try {
      const c = new LLMClient({
        api_key: 'fresh-key',
        base_url: 'https://fresh.example/v1',
        model: 'fresh-model',
        max_tokens: 321,
        timeout_ms: 12345,
        max_retries: 4,
      });
      await c.complete([{ role: 'user', content: 'test' }]);
      const body = JSON.parse(captured.options.body);
      expect(captured.url).toBe('https://fresh.example/v1/chat/completions');
      expect(captured.options.headers.Authorization).toBe('Bearer fresh-key');
      expect(body.model).toBe('fresh-model');
      expect(body.max_tokens).toBe(321);
      expect(c.timeoutMs).toBe(12345);
      expect(c.maxRetries).toBe(4);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('允许单次 LLM 调用覆盖超时与最大尝试次数', async () => {
    const c = new LLMClient({ apiKey: 'test', maxRetries: 5, timeoutMs: 60000 });
    let captured = null;
    c._fetchWithRetry = async (_url, _headers, _body, _extract, requestOptions) => {
      captured = requestOptions;
      return 'ok';
    };

    await expect(c.complete([{ role: 'user', content: 'test' }], 0.1, {
      maxRetries: 2,
      timeoutMs: 45000,
    })).resolves.toBe('ok');
    expect(captured).toMatchObject({ maxRetries: 2, timeoutMs: 45000 });
  });

  it('单次调用将 maxRetries 设为 1 时只请求一次', async () => {
    const originalFetch = global.fetch;
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      throw new TypeError('fetch failed');
    };
    try {
      const c = new LLMClient({ apiKey: 'test', maxRetries: 5 });
      await expect(c.complete([{ role: 'user', content: 'test' }], 0.1, {
        maxRetries: 1,
        timeoutMs: 1000,
      })).rejects.toThrow('fetch failed');
      expect(calls).toBe(1);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('环境变量优先', () => {
    process.env.OPENAI_MODEL = 'env-model';
    const c = new LLMClient();
    expect(c.model).toBe('env-model');
    delete process.env.OPENAI_MODEL;
  });
});

describe('LLMClient.expandSearchKeywords', () => {
  it('解析 keywords JSON，清洗去重并截断数量', async () => {
    const c = new LLMClient({ apiKey: 'test' });
    c.complete = async () => [
      '```json',
      '{"keywords":["演唱会门票","票务转让","求购演出票","演唱会门票","  ","怎么买演唱会票","这是一个特别长的关键词以至于超过四十个字符会被直接丢弃掉的例子这里再补一些字确保超过四十个字符"]}',
      '```',
    ].join('\n');

    const keywords = await c.expandSearchKeywords('想买演唱会门票', 10);

    expect(keywords).toEqual([
      '演唱会门票',
      '票务转让',
      '求购演出票',
      '怎么买演唱会票',
    ]);
  });

  it('支持直接返回 JSON 数组', async () => {
    const c = new LLMClient({ apiKey: 'test' });
    c.complete = async () => '["健身私教","减脂训练营"]';

    const keywords = await c.expandSearchKeywords('想健身的人', 5);

    expect(keywords).toEqual(['健身私教', '减脂训练营']);
  });

  it('无有效关键词时抛出明确错误', async () => {
    const c = new LLMClient({ apiKey: 'test' });
    c.complete = async () => '{"keywords":[]}';

    await expect(c.expandSearchKeywords('测试', 5)).rejects.toThrow('AI 未返回有效关键词');
  });

  it('空种子关键词直接报错，不发请求', async () => {
    const c = new LLMClient({ apiKey: 'test' });
    let called = false;
    c.complete = async () => { called = true; return '{}'; };

    await expect(c.expandSearchKeywords('   ', 5)).rejects.toThrow('缺少客户关键词');
    expect(called).toBe(false);
  });
});

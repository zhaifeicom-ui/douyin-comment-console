#!/usr/bin/env node

const { LLMClient } = require('../lib/llm');

async function main() {
  const baseClient = new LLMClient({ maxRetries: 1, timeoutMs: 20000 });
  const configuredKey = baseClient.apiKey;
  const half = configuredKey.length / 2;
  const duplicatedKey = configuredKey.length > 1
    && configuredKey.slice(0, half) === configuredKey.slice(half)
    ? configuredKey.slice(0, half)
    : null;

  console.log(`baseUrl=${baseClient.baseUrl}`);
  console.log(`model=${baseClient.model}`);
  console.log(`apiKey=${configuredKey ? 'set' : 'empty'}`);
  if (duplicatedKey) console.log('apiKeyShape=duplicated');

  const tests = [{ label: 'configured', apiKey: configuredKey }];
  if (duplicatedKey) tests.push({ label: 'deduplicated', apiKey: duplicatedKey });

  for (const test of tests) {
    const client = new LLMClient({
      apiKey: test.apiKey,
      baseUrl: baseClient.baseUrl,
      model: baseClient.model,
      maxRetries: 1,
      timeoutMs: 20000,
    });
    try {
      const result = await client.complete([
        { role: 'system', content: 'You are a connectivity tester.' },
        { role: 'user', content: 'Reply with exactly: CONNECTED' },
      ], 0);
      console.log(`${test.label}=OK:${result}`);
    } catch (error) {
      console.log(`${test.label}=ERROR:${error.message}`);
    }
  }
}

main();

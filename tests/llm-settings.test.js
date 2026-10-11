const { maskApiKey, normalizeBaseUrl } = require('../lib/app/llm-settings');

describe('前端模型设置', () => {
  it('规范化接口地址并移除末尾斜杠', () => {
    expect(normalizeBaseUrl('https://api.example.com/v1///')).toBe('https://api.example.com/v1');
  });

  it('拒绝非 HTTP 接口地址', () => {
    expect(() => normalizeBaseUrl('file:///tmp/key')).toThrow('只支持 http:// 或 https://');
  });

  it('返回脱敏密钥', () => {
    expect(maskApiKey('sk-1234567890')).toBe('sk-••••7890');
    expect(maskApiKey('short')).toBe('••••••••');
  });
});

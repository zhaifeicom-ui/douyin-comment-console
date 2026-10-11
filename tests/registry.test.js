// tests/registry.test.js — ConnectionRegistry 单元测试

const { ConnectionRegistry } = require('../lib/server/registry');

describe('ConnectionRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = new ConnectionRegistry();
  });

  it('初始状态无连接', () => {
    expect(registry.totalConnections).toBe(0);
    expect(registry.list()).toEqual({});
  });

  it('注册连接', () => {
    const conn = registry.register('douyin.com', null, { url: 'https://douyin.com' });
    expect(conn.id).toBeTruthy();
    expect(conn.site).toBe('douyin.com');
    expect(registry.totalConnections).toBe(1);
  });

  it('获取连接', () => {
    const conn = registry.register('douyin.com', null);
    const got = registry.get('douyin.com', 0);
    expect(got.id).toBe(conn.id);
  });

  it('获取不存在的站点返回 null', () => {
    expect(registry.get('unknown.com', 0)).toBeNull();
  });

  it('多站点隔离', () => {
    registry.register('douyin.com', null);
    registry.register('bilibili.com', null);
    expect(registry.totalConnections).toBe(2);
    expect(registry.get('douyin.com', 0)).toBeTruthy();
    expect(registry.get('bilibili.com', 0)).toBeTruthy();
  });

  it('移除连接 (unregister)', () => {
    const conn = registry.register('douyin.com', null);
    registry.unregister(conn.id);
    expect(registry.totalConnections).toBe(0);
    expect(registry.get('douyin.com', 0)).toBeNull();
  });

  it('list 返回按站点分组的对象', () => {
    registry.register('douyin.com', null, { url: 'https://douyin.com' });
    registry.register('douyin.com', null, { url: 'https://douyin.com/other' });
    const list = registry.list();
    expect(list['douyin.com']).toHaveLength(2);
    expect(list['douyin.com'][0].url).toBe('https://douyin.com');
  });

  it('HTTP 轮询超过心跳期限后不再算作在线，并可清理僵尸记录', () => {
    const conn = registry.register('douyin.com', null);
    const staleNow = Date.parse(conn.lastActivity) + 35001;
    expect(registry.healthyCount({ pollingTtlMs: 35000, now: staleNow })).toBe(0);
    expect(registry.list({ pollingTtlMs: 35000, now: staleNow })['douyin.com'][0].alive).toBe(false);
    expect(registry.removeExpiredPolling(35000, staleNow)).toBe(1);
    expect(registry.totalConnections).toBe(0);
  });

  it('活跃 WebSocket 不受 HTTP 轮询心跳期限影响', () => {
    registry.register('douyin.com', { readyState: 1 });
    expect(registry.healthyCount({ pollingTtlMs: 1, now: Date.now() + 60000 })).toBe(1);
  });
});

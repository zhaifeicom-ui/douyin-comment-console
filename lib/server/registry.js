// lib/server/registry.js — 连接注册表（site → connections[]）

const { randomUUID } = require('crypto');

// 油猴脚本的长轮询每 25 秒至少会重新请求一次。超过 35 秒没有任何
// /api/poll 活动，就不能再把只有注册记录的客户端当成真实在线。
const DEFAULT_POLLING_TTL_MS = 35000;

class ConnectionRegistry {
  constructor() {
    /** @type {Map<string, Array<{ id: string, ws: import('ws'), site: string, url: string, title: string, userAgent: string, connectedAt: string, lastActivity: string }>>} */
    this._map = new Map();
  }

  /**
   * 注册新连接
   * @param {string} site
   * @param {import('ws')} ws
   * @param {{ url?: string, title?: string, userAgent?: string }} meta
   * @returns {object} 连接记录
   */
  register(site, ws, meta = {}) {
    const conn = {
      id: randomUUID(),
      ws,
      site,
      url: meta.url || '',
      title: meta.title || '',
      userAgent: meta.userAgent || '',
      connectedAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
    };

    if (!this._map.has(site)) {
      this._map.set(site, []);
    }
    this._map.get(site).push(conn);

    console.log(`[registry] + ${site} (${conn.id.slice(0, 8)}) — total: ${this._countSite(site)}`);
    return conn;
  }

  /**
   * 清理指定 site 的 HTTP 轮询僵尸连接（ws === null）
   * HTTP 轮询没有 close 事件，页面刷新后旧连接无法被自动清理。
   * 每次 /api/connect 注册新连接前调用此方法，确保不会累积重复条目。
   * @param {string} site
   * @returns {number} 被清理的连接数
   */
  removeStalePolling(site) {
    const conns = this._map.get(site);
    if (!conns || conns.length === 0) return 0;
    const before = conns.length;
    const remaining = conns.filter(c => c.ws !== null); // 保留 WebSocket 连接
    if (remaining.length === 0) {
      this._map.delete(site);
    } else {
      this._map.set(site, remaining);
    }
    const removed = before - remaining.length;
    if (removed > 0) {
      console.log(`[registry] Cleaned ${removed} stale polling connection(s) for ${site}`);
    }
    return removed;
  }

  /**
   * 移除连接（按 ws 对象或 connId）
   */
  unregister(connIdOrWs) {
    for (const [site, conns] of this._map.entries()) {
      const idx = conns.findIndex(
        c => c.id === connIdOrWs || c.ws === connIdOrWs
      );
      if (idx !== -1) {
        const removed = conns.splice(idx, 1)[0];
        console.log(`[registry] - ${site} (${removed.id.slice(0, 8)}) — remaining: ${conns.length}`);
        if (conns.length === 0) {
          this._map.delete(site);
        }
        return removed;
      }
    }
    return null;
  }

  /**
   * 获取某站点的连接（默认返回第一个 alive）
   * @param {string} site
   * @param {number} [index=0]
   * @returns {object|null}
   */
  get(site, index = 0) {
    const conns = this._map.get(site);
    if (!conns || conns.length === 0) return null;
    // WS 优先，HTTP 轮询兜底
    const wsAlive = conns.filter(c => c.ws && c.ws.readyState === 1);
    if (wsAlive.length > 0) return wsAlive[Math.min(index, wsAlive.length - 1)] || null;
    // 无 WS 连接时返回 HTTP 轮询客户端
    return conns[Math.min(index, conns.length - 1)] || null;
  }

  /**
   * 按连接 ID 读取连接。账号池和 HTTP 轮询路由需要精确命中某一个抖音标签页，
   * 不能再把所有标签页都当成同一个默认连接。
   */
  getById(connId) {
    if (!connId) return null;
    for (const conns of this._map.values()) {
      const found = conns.find(c => c.id === connId);
      if (found) return found;
    }
    return null;
  }

  /**
   * 获取某站点所有连接
   */
  getAll(site) {
    return this._map.get(site) || [];
  }

  /**
   * 遍历全部连接（供广播/关闭场景使用，替代外部直读 _map 私有字段）
   * @param {(conn: object) => void} cb
   */
  forEachConnection(cb) {
    for (const conns of this._map.values()) {
      for (const c of conns) cb(c);
    }
  }

  /**
   * 更新连接元信息（URL 变化时）
   */
  updateMeta(connId, meta) {
    for (const conns of this._map.values()) {
      const c = conns.find(x => x.id === connId);
      if (c) {
        if (meta.url) c.url = meta.url;
        if (meta.title) c.title = meta.title;
        c.lastActivity = new Date().toISOString();
        return c;
      }
    }
    return null;
  }

  /**
   * 更新最后活跃时间
   */
  touch(connId) {
    for (const conns of this._map.values()) {
      const c = conns.find(x => x.id === connId);
      if (c) {
        c.lastActivity = new Date().toISOString();
        return;
      }
    }
  }

  /**
   * 获取完整状态快照
   */
  list(options = {}) {
    const pollingTtlMs = Number(options.pollingTtlMs) || DEFAULT_POLLING_TTL_MS;
    const now = Number(options.now) || Date.now();
    const result = {};
    for (const [site, conns] of this._map.entries()) {
      result[site] = conns.map((c, index) => ({
        id: c.id,
        site,
        index,
        url: c.url,
        title: c.title,
        userAgent: c.userAgent,
        connectedAt: c.connectedAt,
        lastActivity: c.lastActivity,
        transport: c.ws ? 'websocket' : 'polling',
        staleForMs: Math.max(0, now - Date.parse(c.lastActivity)),
        alive: c.ws
          ? c.ws.readyState === 1
          : now - Date.parse(c.lastActivity) <= pollingTtlMs,
      }));
    }
    return result;
  }

  /** 返回仍可实际接收命令的连接数。 */
  healthyCount(options = {}) {
    let count = 0;
    for (const conns of Object.values(this.list(options))) {
      count += conns.filter(conn => conn.alive).length;
    }
    return count;
  }

  /** 清理超过心跳期限的 HTTP 轮询记录，WebSocket 不受影响。 */
  removeExpiredPolling(maxAgeMs = DEFAULT_POLLING_TTL_MS, now = Date.now()) {
    let removed = 0;
    for (const [site, conns] of this._map.entries()) {
      const remaining = conns.filter(conn => {
        if (conn.ws !== null) return true;
        const alive = now - Date.parse(conn.lastActivity) <= maxAgeMs;
        if (!alive) removed += 1;
        return alive;
      });
      if (remaining.length) this._map.set(site, remaining);
      else this._map.delete(site);
    }
    if (removed > 0) console.log(`[registry] Cleaned ${removed} expired polling connection(s)`);
    return removed;
  }

  /**
   * 总连接数
   */
  get totalConnections() {
    let count = 0;
    for (const conns of this._map.values()) count += conns.length;
    return count;
  }

  _countSite(site) {
    return (this._map.get(site) || []).length;
  }
}

module.exports = { ConnectionRegistry, DEFAULT_POLLING_TTL_MS };

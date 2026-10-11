// lib/commands/search.js — 搜索视频

const { SITE, escapeExpression, getFlag, withAudit } = require('./helpers');

/**
 * 搜索视频
 * @param {object} ctx - { bridge, audit, loggedCall }
 * @param {string[]} args - [keyword, --offset N, --count N]
 */
async function cmdSearch(ctx, args) {
  const kw = args[0];
  if (!kw) throw new Error('用法: node cli.js search <keyword> [--offset N] [--count N]');
  const offset = getFlag(args, '--offset', 0);
  const count = Math.min(getFlag(args, '--count', 10), 20);

  return withAudit(ctx, 'search', { keyword: kw, offset, count }, async () => {
    const expr = `window.__bridge.search('${escapeExpression(kw)}', ${offset}, ${count})`;
    const data = await ctx.loggedCall('search', { keyword: kw, offset, count }, expr);
    if (data?.status_code !== undefined && Number(data.status_code) !== 0) {
      const code = Number(data.status_code);
      const detail = String(data.status_msg || data.message || '').trim();
      const hint = code === 2483
        ? '抖音账号未登录或登录态已失效，请在抖音网页完成登录后重试'
        : `抖音拒绝了搜索请求${detail ? `：${detail}` : ''}`;
      throw new Error(`${hint} (status_code=${code})`);
    }
    const items = (data.data || []).filter(d => d.aweme_info).map(d => {
      const info = d.aweme_info;
      const stats = info.statistics || {};
      return {
        aweme_id: info.aweme_id,
        desc: (info.desc || '').substring(0, 180),
        author: info.author?.nickname || '',
        uid: info.author?.uid || '',
        time: info.create_time || 0,
        plays: stats.play_count || 0,
        comments: stats.comment_count || 0,
        likes: stats.digg_count || 0,
        shares: stats.share_count || 0,
        collects: stats.collect_count || 0,
      };
    });
    return { summary: { count: items.length }, result: { result: items }, output: items };
  });
}

module.exports = cmdSearch;

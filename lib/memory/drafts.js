// lib/memory/drafts.js — 回复草稿管理
const { getDb } = require('./db');

const PLATFORM = 'douyin';

function save(fields) {
  if (!fields || !fields.awemeId || !fields.text) return null;
  try {
    const db = getDb();
    // 同一条评论只能有一份待审核草稿。重复执行任务时更新原草稿，
    // 避免草稿箱被同一客户的重复记录淹没。
    if (fields.replyToCid) {
      const existing = db.prepare(`
        SELECT id FROM drafts
        WHERE aweme_id = ? AND reply_to_cid = ? AND posted = 0
        ORDER BY created_at DESC LIMIT 1
      `).get(String(fields.awemeId), String(fields.replyToCid));
      if (existing?.id) {
        db.prepare('UPDATE drafts SET text = ?, persona_id = ?, created_at = ? WHERE id = ?').run(
          String(fields.text),
          fields.personaId || null,
          Date.now(),
          existing.id,
        );
        return Number(existing.id);
      }
    }
    const info = db.prepare(`
      INSERT INTO drafts (aweme_id, reply_to_cid, text, persona_id, created_at)
      VALUES (@awemeId, @replyToCid, @text, @personaId, @createdAt)
    `).run({
      awemeId: String(fields.awemeId),
      replyToCid: fields.replyToCid || null,
      text: String(fields.text),
      personaId: fields.personaId || null,
      createdAt: Date.now(),
    });
    return Number(info.lastInsertRowid);
  } catch (e) { return null; }
}

function get(id) {
  if (!id) return null;
  try {
    return getDb().prepare('SELECT * FROM drafts WHERE id = ?').get(Number(id)) || null;
  } catch (e) { return null; }
}

function list(opts = {}) {
  try {
    const db = getDb();
    const where = [];
    const params = [];
    if (opts.awemeId) { where.push('aweme_id = ?'); params.push(String(opts.awemeId)); }
    if (opts.posted != null) { where.push('posted = ?'); params.push(opts.posted ? 1 : 0); }
    const limit = Math.min(Number(opts.limit) || 50, 200);
    const rows = db.prepare(`
      SELECT * FROM drafts ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY created_at DESC LIMIT ${limit}
    `).all(...params);
    return rows;
  } catch (e) { return []; }
}

function markPosted(id) {
  if (!id) return false;
  try {
    getDb().prepare('UPDATE drafts SET posted = 1 WHERE id = ?').run(Number(id));
    return true;
  } catch (e) { return false; }
}

function markPostedByComment(awemeId, replyToCid) {
  if (!awemeId || !replyToCid) return false;
  try {
    getDb().prepare(`
      UPDATE drafts SET posted = 1
      WHERE aweme_id = ? AND reply_to_cid = ? AND posted = 0
    `).run(String(awemeId), String(replyToCid));
    return true;
  } catch (e) { return false; }
}

function remove(id) {
  if (!id) return false;
  try {
    getDb().prepare('DELETE FROM drafts WHERE id = ?').run(Number(id));
    return true;
  } catch (e) { return false; }
}

function count(opts = {}) {
  try {
    const where = [];
    const params = [];
    if (opts.posted != null) { where.push('posted = ?'); params.push(opts.posted ? 1 : 0); }
    return getDb().prepare(`
      SELECT count(*) AS n FROM drafts ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    `).get(...params)?.n || 0;
  } catch (e) { return 0; }
}

module.exports = { save, get, list, markPosted, markPostedByComment, remove, count };

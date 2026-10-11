// lib/memory/dm.js — 抖音真实私信会话与消息持久化
//
// 评论是获客线索，私信才是会话。这个模块只保存桥接收到的真实 DM
// 事件和应用实际发出的 DM，避免前端再把评论记录伪装成聊天消息。

const crypto = require('crypto');
const { getDb } = require('./db');

const PLATFORM = 'douyin';

function textOf(value) {
  if (value == null) return '';
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object') {
        return String(parsed.text || parsed.content || parsed.title || value);
      }
    } catch (_) { /* 普通文本 */ }
    return value;
  }
  if (typeof value === 'object') {
    return String(value.text || value.content || value.title || '');
  }
  return String(value);
}

function normalizeAccountId(value) {
  const id = String(value || '').trim();
  return id || 'default';
}

function normalizeConversationId(value, peerUid = '') {
  const id = String(value || '').trim();
  return id || `peer:${String(peerUid || '').trim() || 'unknown'}`;
}

function derivedRemoteId(fields, content, createdAt) {
  if (fields.remoteId != null && String(fields.remoteId).trim()) return String(fields.remoteId);
  return crypto.createHash('sha1').update([
    fields.direction || 'inbound',
    fields.conversationId || '',
    fields.senderUid || '',
    content,
    createdAt,
  ].join('|')).digest('hex');
}

function upsertConversation(fields = {}) {
  const accountId = normalizeAccountId(fields.accountId);
  const conversationId = normalizeConversationId(fields.conversationId, fields.peerUid);
  const now = Number(fields.updatedAt || Date.now());
  const lastMessageAt = Number(fields.lastMessageAt || fields.createdAt || now);
  try {
    getDb().prepare(`
      INSERT INTO dm_conversations (
        platform, account_id, conversation_id, peer_uid, peer_nickname, peer_avatar,
        last_message_at, unread_count, created_at, updated_at
      ) VALUES ('${PLATFORM}', @accountId, @conversationId, @peerUid, @peerNickname, @peerAvatar,
        @lastMessageAt, @unreadCount, @createdAt, @updatedAt)
      ON CONFLICT(platform, account_id, conversation_id) DO UPDATE SET
        peer_uid = COALESCE(excluded.peer_uid, dm_conversations.peer_uid),
        peer_nickname = COALESCE(NULLIF(excluded.peer_nickname, ''), dm_conversations.peer_nickname),
        peer_avatar = COALESCE(NULLIF(excluded.peer_avatar, ''), dm_conversations.peer_avatar),
        last_message_at = MAX(COALESCE(dm_conversations.last_message_at, 0), excluded.last_message_at),
        unread_count = dm_conversations.unread_count + excluded.unread_count,
        updated_at = MAX(dm_conversations.updated_at, excluded.updated_at)
    `).run({
      accountId,
      conversationId,
      peerUid: fields.peerUid ? String(fields.peerUid) : null,
      peerNickname: fields.peerNickname ? String(fields.peerNickname) : null,
      peerAvatar: fields.peerAvatar ? String(fields.peerAvatar) : null,
      lastMessageAt,
      unreadCount: Number(fields.unreadDelta || 0),
      createdAt: Number(fields.createdAt || now),
      updatedAt: now,
    });
    return true;
  } catch (error) {
    if (process.env.DOUYIN_DEBUG) console.warn('[dm.upsertConversation] failed:', error.message);
    return false;
  }
}

/** 写入一条真实私信；同一远端消息重复轮询时会被唯一键去重。 */
function appendMessage(fields = {}) {
  const accountId = normalizeAccountId(fields.accountId);
  const conversationId = normalizeConversationId(fields.conversationId, fields.peerUid);
  const direction = ['inbound', 'outbound', 'system'].includes(fields.direction)
    ? fields.direction : 'inbound';
  const content = textOf(fields.content);
  const createdAt = Number(fields.createdAt || Date.now());
  const remoteId = derivedRemoteId({ ...fields, accountId, conversationId, direction }, content, createdAt);
  try {
    const db = getDb();
    const insert = db.prepare(`
      INSERT OR IGNORE INTO dm_messages (
        platform, account_id, conversation_id, remote_id, sender_uid, sender_nickname,
        direction, content, message_type, status, created_at
      ) VALUES ('${PLATFORM}', @accountId, @conversationId, @remoteId, @senderUid, @senderNickname,
        @direction, @content, @messageType, @status, @createdAt)
    `).run({
      accountId,
      conversationId,
      remoteId,
      senderUid: fields.senderUid ? String(fields.senderUid) : null,
      senderNickname: fields.senderNickname ? String(fields.senderNickname) : null,
      direction,
      content,
      messageType: fields.messageType != null ? String(fields.messageType) : null,
      status: fields.status || (direction === 'outbound' ? 'sent' : 'received'),
      createdAt,
    });
    // 只有真正插入的新 inbound 消息增加未读数；重复事件不能反复计数。
    upsertConversation({
      accountId,
      conversationId,
      peerUid: fields.peerUid || (direction === 'inbound' ? fields.senderUid : null),
      peerNickname: fields.peerNickname || fields.senderNickname,
      peerAvatar: fields.peerAvatar,
      lastMessageAt: createdAt,
      createdAt,
      updatedAt: Date.now(),
      unreadDelta: insert.changes && direction === 'inbound' ? 1 : 0,
    });
    return { inserted: Boolean(insert.changes), id: insert.lastInsertRowid ? Number(insert.lastInsertRowid) : null, remoteId, conversationId, accountId };
  } catch (error) {
    if (process.env.DOUYIN_DEBUG) console.warn('[dm.appendMessage] failed:', error.message);
    return { inserted: false, error: error.message, remoteId, conversationId, accountId };
  }
}

function rowMessage(row) {
  return {
    id: Number(row.id),
    accountId: row.account_id,
    conversationId: row.conversation_id,
    remoteId: row.remote_id,
    senderUid: row.sender_uid || '',
    senderNickname: row.sender_nickname || '',
    direction: row.direction,
    content: row.content || '',
    messageType: row.message_type || '',
    status: row.status || '',
    createdAt: Number(row.created_at || 0),
  };
}

function listMessages(conversationId, options = {}) {
  const accountId = normalizeAccountId(options.accountId);
  const id = normalizeConversationId(conversationId, options.peerUid);
  const limit = Math.min(Math.max(Number(options.limit) || 100, 1), 500);
  try {
    const rows = getDb().prepare(`
      SELECT * FROM dm_messages
      WHERE platform = '${PLATFORM}' AND account_id = ? AND conversation_id = ?
      ORDER BY created_at ASC, id ASC LIMIT ${limit}
    `).all(accountId, id);
    return rows.map(rowMessage);
  } catch (_) { return []; }
}

function listConversations(options = {}) {
  const ids = (Array.isArray(options.accountIds) ? options.accountIds : [options.accountId])
    .map(normalizeAccountId).filter(Boolean);
  const limit = Math.min(Math.max(Number(options.limit) || 100, 1), 500);
  try {
    const where = [`platform = '${PLATFORM}'`];
    const params = [];
    if (ids.length && !(ids.length === 1 && ids[0] === 'default')) {
      where.push(`account_id IN (${ids.map(() => '?').join(',')})`);
      params.push(...ids);
    }
    const rows = getDb().prepare(`
      SELECT * FROM dm_conversations
      WHERE ${where.join(' AND ')}
      ORDER BY COALESCE(last_message_at, updated_at) DESC, updated_at DESC
      LIMIT ${limit}
    `).all(...params);
    return rows.map(row => ({
      accountId: row.account_id,
      conversationId: row.conversation_id,
      peerUid: row.peer_uid || '',
      peerNickname: row.peer_nickname || '',
      peerAvatar: row.peer_avatar || '',
      lastMessageAt: Number(row.last_message_at || row.updated_at || 0),
      unreadCount: Number(row.unread_count || 0),
      createdAt: Number(row.created_at || 0),
      updatedAt: Number(row.updated_at || 0),
      messages: listMessages(row.conversation_id, { accountId: row.account_id, limit: options.messageLimit || 100 }),
    }));
  } catch (_) { return []; }
}

function markRead(conversationId, accountId) {
  try {
    getDb().prepare(`
      UPDATE dm_conversations SET unread_count = 0, updated_at = ?
      WHERE platform = '${PLATFORM}' AND account_id = ? AND conversation_id = ?
    `).run(Date.now(), normalizeAccountId(accountId), normalizeConversationId(conversationId));
    return true;
  } catch (_) { return false; }
}

function countUnread(accountId = '') {
  try {
    const params = [];
    let sql = `SELECT COALESCE(SUM(unread_count), 0) AS n FROM dm_conversations WHERE platform = '${PLATFORM}'`;
    if (accountId) { sql += ' AND account_id = ?'; params.push(normalizeAccountId(accountId)); }
    return Number(getDb().prepare(sql).get(...params)?.n || 0);
  } catch (_) { return 0; }
}

/** 自动化防重复：同一账号给同一用户已经发过私信时，不再重复触达。 */
function hasOutbound(accountId, peerUid) {
  const normalizedAccount = normalizeAccountId(accountId);
  const uid = String(peerUid || '').trim();
  if (!uid) return false;
  try {
    const row = getDb().prepare(`
      SELECT 1
      FROM dm_messages AS m
      INNER JOIN dm_conversations AS c
        ON c.platform = m.platform
       AND c.account_id = m.account_id
       AND c.conversation_id = m.conversation_id
      WHERE m.platform = '${PLATFORM}'
        AND m.account_id = ?
        AND c.peer_uid = ?
        AND m.direction = 'outbound'
      LIMIT 1
    `).get(normalizedAccount, uid);
    return Boolean(row);
  } catch (_) { return false; }
}

module.exports = {
  upsertConversation,
  appendMessage,
  listMessages,
  listConversations,
  markRead,
  countUnread,
  hasOutbound,
};

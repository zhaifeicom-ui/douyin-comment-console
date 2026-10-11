// lib/memory/app-jobs.js — 前端后台任务与结果持久化
const { getDb } = require('./db');

function parseJson(value, fallback) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

function toJob(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    progress: Number(row.progress || 0),
    message: row.message || '',
    meta: parseJson(row.meta_json, {}),
    details: parseJson(row.details_json, {}),
    result: parseJson(row.result_json, null),
    error: row.error || null,
    createdAt: Number(row.created_at || 0),
    updatedAt: Number(row.updated_at || 0),
    startedAt: row.started_at == null ? null : Number(row.started_at),
    finishedAt: row.finished_at == null ? null : Number(row.finished_at),
  };
}

function upsert(job) {
  if (!job?.id || !job?.type) return false;
  try {
    getDb().prepare(`
      INSERT INTO app_jobs (
        id, type, status, progress, message, meta_json, details_json, result_json,
        error, created_at, updated_at, started_at, finished_at
      ) VALUES (
        @id, @type, @status, @progress, @message, @metaJson, @detailsJson, @resultJson,
        @error, @createdAt, @updatedAt, @startedAt, @finishedAt
      )
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        progress = excluded.progress,
        message = excluded.message,
        meta_json = excluded.meta_json,
        details_json = excluded.details_json,
        result_json = excluded.result_json,
        error = excluded.error,
        updated_at = excluded.updated_at,
        started_at = excluded.started_at,
        finished_at = excluded.finished_at
    `).run({
      id: String(job.id),
      type: String(job.type),
      status: String(job.status || 'queued'),
      progress: Number(job.progress || 0),
      message: job.message || '',
      metaJson: JSON.stringify(job.meta || {}),
      detailsJson: JSON.stringify(job.details || {}),
      resultJson: job.result == null ? null : JSON.stringify(job.result),
      error: job.error || null,
      createdAt: Number(job.createdAt || Date.now()),
      updatedAt: Number(job.updatedAt || Date.now()),
      startedAt: job.startedAt == null ? null : Number(job.startedAt),
      finishedAt: job.finishedAt == null ? null : Number(job.finishedAt),
    });
    return true;
  } catch (error) {
    console.warn(`[app-jobs] save failed: ${error.message}`);
    return false;
  }
}

function get(id) {
  if (!id) return null;
  try {
    return toJob(getDb().prepare('SELECT * FROM app_jobs WHERE id = ?').get(String(id)));
  } catch (_) { return null; }
}

function list(opts = {}) {
  try {
    const where = [];
    const params = [];
    if (opts.status) { where.push('status = ?'); params.push(String(opts.status)); }
    if (opts.type) { where.push('type = ?'); params.push(String(opts.type)); }
    const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 1000);
    return getDb().prepare(`
      SELECT * FROM app_jobs ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY created_at DESC LIMIT ${limit}
    `).all(...params).map(toJob);
  } catch (_) { return []; }
}

module.exports = { upsert, get, list };

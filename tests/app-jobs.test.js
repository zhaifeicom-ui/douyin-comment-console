const path = require('path');
const fs = require('fs');
const os = require('os');

describe('app jobs memory module', () => {
  let tmpDir;
  let jobs;
  let db;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'douyin-app-jobs-test-'));
    process.env.DOUYIN_STORAGE_DIR = tmpDir;
    delete require.cache[require.resolve('../lib/memory/db')];
    delete require.cache[require.resolve('../lib/memory/app-jobs')];
    db = require('../lib/memory/db');
    jobs = require('../lib/memory/app-jobs');
  });

  afterAll(() => {
    try { db.closeDb(); } catch (_) {}
    try { fs.rmSync(tmpDir, { recursive: true }); } catch (_) {}
    delete process.env.DOUYIN_STORAGE_DIR;
  });

  it('保存任务完整结果并支持更新后恢复', () => {
    const base = {
      id: 'job-history-1', type: 'campaign:run', status: 'running', progress: 35,
      message: '执行中', meta: { keyword: '求票' }, details: { phase: 'search' }, result: null,
      error: null, createdAt: 100, updatedAt: 101, startedAt: 100, finishedAt: null,
    };
    expect(jobs.upsert(base)).toBe(true);
    jobs.upsert({ ...base, status: 'succeeded', progress: 100, result: { videoCount: 2 }, updatedAt: 200, finishedAt: 200 });
    expect(jobs.get(base.id)).toMatchObject({ status: 'succeeded', result: { videoCount: 2 }, meta: { keyword: '求票' } });
    expect(jobs.list()).toHaveLength(1);
  });
});

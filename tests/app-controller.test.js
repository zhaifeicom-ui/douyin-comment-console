const { AppController } = require('../lib/app/controller');
const videos = require('../lib/memory/videos');
const comments = require('../lib/memory/comments');

function waitForJob(controller, id) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const tick = () => {
      const job = controller.getJob(id);
      if (job.status === 'succeeded') return resolve(job);
      if (job.status === 'failed') return reject(new Error(job.error || 'job failed'));
      if (Date.now() - startedAt > 1000) return reject(new Error('timed out waiting for job'));
      setTimeout(tick, 10);
    };
    tick();
  });
}

describe('AppController', () => {
  it('解析纯数字 aweme_id', async () => {
    const controller = new AppController({ ctx: {} });
    const video = await controller.resolveVideoInput('1234567890123456789');
    expect(video).toEqual({ awemeId: '1234567890123456789', source: 'aweme_id' });
  });

  it('解析视频页面链接中的 aweme_id', async () => {
    const controller = new AppController({ ctx: {} });
    const video = await controller.resolveVideoInput('https://www.douyin.com/video/1234567890123456789');
    expect(video).toEqual({ awemeId: '1234567890123456789', source: 'url' });
  });

  it('回复评论时把参数数组原样传给命令层', async () => {
    const calls = [];
    const ctx = {
      async cmdPost(args) {
        calls.push(args);
        return { cid: 'reply-1', text: args[1], status: 'published' };
      },
    };
    const controller = new AppController({ ctx });
    const job = controller.replyToComment('1234567890123456789', 'source-cid', '你好');
    await waitForJob(controller, job.id);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual([
      '1234567890123456789',
      '你好',
      '--reply-to',
      'source-cid',
    ]);
  });

  it('发现视频时使用目标客户设置搜索，并按数量逐个抓取评论', async () => {
    const originalUpsert = videos.upsert;
    const searchCalls = [];
    const getCalls = [];
    const ctx = {
      async cmdSearch(args) {
        searchCalls.push(args);
        return [
          { aweme_id: '1111111111111111111', desc: '视频一', uid: 'u1', time: 1, plays: 10 },
          { aweme_id: '2222222222222222222', desc: '视频二', uid: 'u2', time: 2, plays: 20 },
        ];
      },
      async cmdGet(args) {
        getCalls.push(args);
        return [{ cid: 'c1', text: '评论', likes: 0, replies: 0, time: 1, user: null }];
      },
    };
    const settings = {
      loadSettings() {
        return {
          targetCustomer: '想买演唱会门票',
          searchVideoCount: 3,
          maxCommentsPerVideo: 2,
        };
      },
    };

    videos.upsert = () => true;
    try {
      const controller = new AppController({ ctx, settings });
      const job = controller.discoverVideos({ count: 2 });
      await waitForJob(controller, job.id);

      expect(searchCalls).toEqual([['想买演唱会门票', '--count', '2']]);
      expect(getCalls).toHaveLength(2);
      expect(getCalls[0]).toEqual([
        '1111111111111111111',
        '--count',
        '20',
        '--pages',
        '1',
      ]);
      expect(getCalls[1][0]).toBe('2222222222222222222');
      expect(job.result.videos).toHaveLength(2);
      expect(job.result.videos[0].commentCount).toBe(1);
    } finally {
      videos.upsert = originalUpsert;
    }
  });

  it('抓取单视频评论时把页数参数传给命令层', async () => {
    const getCalls = [];
    const ctx = {
      async cmdGet(args) {
        getCalls.push(args);
        return Array.from({ length: 25 }, (_, i) => ({ cid: `c${i}` }));
      },
    };
    const controller = new AppController({ ctx });
    const job = controller.fetchComments('1234567890123456789', { maxCommentsPerVideo: 25 });
    await waitForJob(controller, job.id);

    expect(getCalls).toHaveLength(1);
    expect(getCalls[0]).toEqual([
      '1234567890123456789',
      '--count',
      '20',
      '--pages',
      '2',
    ]);
    expect(job.result.comments).toHaveLength(25);
  });

  it('每视频上限为 0 时使用 --all 抓取全部评论', async () => {
    const getCalls = [];
    const ctx = {
      async cmdGet(args) {
        getCalls.push(args);
        return Array.from({ length: 35 }, (_, i) => ({ cid: `c${i}` }));
      },
    };
    const controller = new AppController({ ctx });
    const job = controller.fetchComments('1234567890123456789', { maxCommentsPerVideo: 0 });
    await waitForJob(controller, job.id);

    expect(getCalls).toEqual([
      [
        '1234567890123456789',
        '--count',
        '20',
        '--all',
      ],
    ]);
    expect(job.result.comments).toHaveLength(35);
  });

  it('一体化流程：AI 扩词 → 多关键词搜索按 aweme_id 去重 → 抓评论 → 统一回复', async () => {
    const originalUpsert = videos.upsert;
    const originalGet = comments.get;
    const searchCalls = [];
    const getCalls = [];
    const postCalls = [];
    const llm = {
      async expandSearchKeywords(seed) {
        return ['门票求购', seed];
      },
    };
    const ctx = {
      async cmdSearch(args) {
        searchCalls.push(args);
        if (args[0] === '想买演唱会门票') {
          return [
            { aweme_id: '1111111111111111111', desc: '视频一', uid: 'u1', time: 1, plays: 10 },
          ];
        }
        return [
          { aweme_id: '1111111111111111111', desc: '视频一重复', uid: 'u1', time: 1, plays: 10 },
          { aweme_id: '2222222222222222222', desc: '视频二', uid: 'u2', time: 2, plays: 20 },
        ];
      },
      async cmdGet(args) {
        getCalls.push(args);
        return [{ cid: `c-${args[0]}`, text: '求票，多少钱？', likes: 1, time: 1, user: null }];
      },
      async cmdPost(args) {
        postCalls.push(args);
        return { cid: `reply-${args[2]}`, text: args[1], status: 'published' };
      },
    };
    const settings = {
      loadSettings() {
        return {
          targetCustomer: '想买演唱会门票',
          searchVideoCount: 5,
          maxCommentsPerVideo: 5,
          keywordExpandEnabled: true,
          keywordExpandCount: 10,
          defaultReplyText: '',
        };
      },
    };

    videos.upsert = () => true;
    comments.get = () => null;
    try {
      const controller = new AppController({ ctx, settings, llm });
      const job = controller.runCampaign({
        videoCount: 2,
        commentsPerVideo: 1,
        replyText: '你好呀，需要帮忙吗？',
      });
      await waitForJob(controller, job.id);

      expect(job.result.keywords).toEqual(['想买演唱会门票', '门票求购']);
      expect(searchCalls).toHaveLength(2);
      expect(searchCalls[0]).toEqual(['想买演唱会门票', '--count', '4']);
      expect(getCalls).toHaveLength(2);
      // 111 在第二个关键词里重复出现，必须被去重
      expect(job.result.videos.map(v => v.awemeId).sort()).toEqual([
        '1111111111111111111',
        '2222222222222222222',
      ]);
      expect(job.result.videos[0].commentCount).toBe(1);
      expect(job.result.replyStats).toEqual({ target: 2, succeeded: 2, failed: 0, skipped: 0 });
      expect(postCalls).toHaveLength(2);
      expect(postCalls[0]).toEqual([
        '1111111111111111111',
        '你好呀，需要帮忙吗？',
        '--reply-to',
        'c-1111111111111111111',
      ]);
    } finally {
      videos.upsert = originalUpsert;
      comments.get = originalGet;
    }
  });

  it('一体化流程：扩词失败时回退原始关键词继续检索，已回复评论跳过', async () => {
    const originalUpsert = videos.upsert;
    const originalGet = comments.get;
    const searchCalls = [];
    const postCalls = [];
    const llm = {
      async expandSearchKeywords() {
        throw new Error('LLM down');
      },
    };
    const ctx = {
      async cmdSearch(args) {
        searchCalls.push(args);
        return [{ aweme_id: '4444444444444444444', desc: '视频四', uid: 'u4', time: 4, plays: 40 }];
      },
      async cmdGet(args) {
        return [
          { cid: 'already-replied', text: '已回复过的评论', likes: 2, time: 2, user: null },
          { cid: 'fresh', text: '新评论', likes: 3, time: 3, user: null },
        ];
      },
      async cmdPost(args) {
        postCalls.push(args);
        return { cid: `reply-${args[3]}`, status: 'published' };
      },
    };
    const settings = {
      loadSettings() {
        return {
          targetCustomer: '想买演唱会门票',
          searchVideoCount: 5,
          maxCommentsPerVideo: 5,
          keywordExpandEnabled: true,
          keywordExpandCount: 10,
          defaultReplyText: '',
        };
      },
    };

    videos.upsert = () => true;
    comments.get = cid => (cid === 'already-replied' ? { replied: true } : null);
    try {
      const controller = new AppController({ ctx, settings, llm });
      const job = controller.runCampaign({ videoCount: 1, commentsPerVideo: 2, replyText: '统一回复' });
      await waitForJob(controller, job.id);

      expect(job.result.keywords).toEqual(['想买演唱会门票']);
      expect(searchCalls).toHaveLength(1);
      expect(job.result.warnings.some(w => w.includes('扩词失败'))).toBe(true);
      expect(postCalls).toHaveLength(1);
      expect(postCalls[0][3]).toBe('fresh');
      expect(job.result.replyStats).toEqual({ target: 2, succeeded: 1, failed: 0, skipped: 1 });
      expect(job.result.videos[0].replies.find(r => r.cid === 'already-replied').status).toBe('skipped');
    } finally {
      videos.upsert = originalUpsert;
      comments.get = originalGet;
    }
  });

  it('未连接抖音时一体化任务直接拒绝启动并提示连接方法', () => {
    const controller = new AppController({
      ctx: {},
      hasConnection: () => false,
      settings: { loadSettings: () => ({ targetCustomer: '想买演唱会门票' }) },
    });
    expect(() => controller.runCampaign({ videoCount: 1 })).toThrow('抖音尚未连接');
  });

  it('未连接抖音时筛选视频同样直接拒绝', () => {
    const controller = new AppController({
      ctx: {},
      hasConnection: () => false,
      settings: { loadSettings: () => ({ targetCustomer: '想买演唱会门票' }) },
    });
    expect(() => controller.discoverVideos({})).toThrow('抖音尚未连接');
  });
});

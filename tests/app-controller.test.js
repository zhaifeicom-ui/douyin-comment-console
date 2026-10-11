const {
  AppController,
  isModelApiRelayCampaign,
  hasModelApiServiceContext,
  scoreModelApiRelaySignal,
} = require('../lib/app/controller');
const videos = require('../lib/memory/videos');
const comments = require('../lib/memory/comments');
const users = require('../lib/memory/users');

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

describe('API 中转找客的主题门槛', () => {
  it('只对大模型/API 中转画像启用，不影响演唱会等其他行业', () => {
    expect(isModelApiRelayCampaign('寻找便宜稳定的大模型 API 中转服务用户')).toBe(true);
    expect(isModelApiRelayCampaign('最近想买薛之谦演唱会门票的人')).toBe(false);
  });

  it('排除旅游中转站和无关价格讨论，保留真实模型/API语境', () => {
    expect(hasModelApiServiceContext({
      title: '难怪首尔是世界的中转站',
      sampleComments: [{ text: '价格太贵了' }],
    })).toBe(false);
    expect(hasModelApiServiceContext({
      title: '护肤产品价格测评',
      sampleComments: [{ text: '这个价格还可以' }],
    })).toBe(false);
    expect(hasModelApiServiceContext({
      title: 'Claude Code API 接入教程',
      sampleComments: [{ text: '有没有稳定的接口推荐' }],
    })).toBe(true);
  });

  it('搜索词本身不能把无关视频伪装成模型/API内容', () => {
    expect(hasModelApiServiceContext({
      title: '首尔中转站旅行攻略',
      sourceKeyword: '大模型 API 中转站推荐',
      sampleComments: [{ text: '价格怎么样' }],
    })).toBe(false);
  });

  it('保留明确找中转、问价格和比较稳定性的评论', () => {
    expect(scoreModelApiRelaySignal('求中转站').qualifies).toBe(true);
    expect(scoreModelApiRelaySignal('怎么中转的价格都不写的？').qualifies).toBe(true);
    expect(scoreModelApiRelaySignal(
      '我比较关心价格，比官网直连便宜多少才是硬道理',
      'Claude API 中转服务讨论',
    ).qualifies).toBe(true);
    expect(scoreModelApiRelaySignal(
      '我试过类似的中转，稳定性参差不齐，这边稳不稳还未知',
    ).qualifies).toBe(true);
  });

  it('过滤普通模型讨论、自我推广和泛情绪评论', () => {
    expect(scoreModelApiRelaySignal('GPT Plus 订阅比 API 便宜', 'GPT 与 Kimi 价格讨论').qualifies).toBe(false);
    expect(scoreModelApiRelaySignal('自己建了一个中转站，欢迎来体验').qualifies).toBe(false);
    expect(scoreModelApiRelaySignal('用了几百个中转站，最终找到了一个稳定又便宜的').qualifies).toBe(false);
    expect(scoreModelApiRelaySignal('中转站水太深，新手从豆包起步少踩坑').qualifies).toBe(false);
  });

  it('找客流程只把中转需求信号送入 AI，不把普通模型讨论送去判定', async () => {
    const originalUpsert = videos.upsert;
    const originalGet = comments.get;
    const originalSetAnalysis = comments.setAnalysis;
    const now = Math.floor(Date.now() / 1000);
    const analyzedPrompts = [];
    const ctx = {
      async cmdSearch() {
        return [{
          aweme_id: '5555555555555555555',
          desc: 'Claude API 中转站真实使用体验',
          time: now,
          comments: 80,
        }];
      },
      async cmdGet() {
        return [
          { cid: 'relay-price', text: '怎么中转的价格都不写的？', time: now },
          { cid: 'relay-stability', text: '我试过类似的中转，稳定性参差不齐，这边稳不稳还未知', time: now },
          { cid: 'model-praise', text: 'GPT 这次效果很不错', time: now },
          { cid: 'no-keyword-1', text: '讲得很清楚', time: now },
          { cid: 'no-keyword-2', text: '学习了', time: now },
        ];
      },
    };
    const llm = {
      async complete(messages) {
        analyzedPrompts.push(messages[1].content);
        return JSON.stringify([
          { cid: 'relay-price', is_target: true, intent_score: 88, intent_label: '高意向' },
          { cid: 'relay-stability', is_target: true, intent_score: 82, intent_label: '高意向' },
        ]);
      },
      extractJSON(value) { return JSON.parse(value); },
    };
    videos.upsert = () => true;
    comments.get = () => null;
    comments.setAnalysis = () => true;
    try {
      const controller = new AppController({
        ctx,
        llm,
        settings: { loadSettings: () => ({
          targetCustomer: '寻找第三方大模型 API 中转服务的用户',
          keywordExpandEnabled: false,
          aiIntentEnabled: true,
          intentThreshold: 75,
          videoTimeRangeDays: 30,
          commentTimeRangeDays: 30,
          minVideoComments: 1,
          sampleCommentsPerVideo: 5,
          minVideoLeadClues: 1,
        }) },
      });
      const job = controller.runCampaign({
        manualKeywords: ['Claude API 中转站'],
        commentKeywords: ['中转', 'API', '价格', '稳定', 'GPT'],
        videoCount: 1,
        commentsPerVideo: 5,
        sampleCommentsPerVideo: 5,
        minVideoComments: 1,
        videoTimeRangeDays: 30,
        commentTimeRangeDays: 30,
      });
      const finished = await waitForJob(controller, job.id);
      expect(finished.result.filterStats).toMatchObject({ eligible: 2, qualified: 2, commentsSignalMiss: 1 });
      expect(analyzedPrompts).toHaveLength(1);
      expect(analyzedPrompts[0]).toContain('relay-price');
      expect(analyzedPrompts[0]).toContain('relay-stability');
      expect(analyzedPrompts[0]).not.toContain('model-praise');
      expect(finished.result.sampledVideoAudit).toMatchObject([
        { awemeId: '5555555555555555555', selected: true, filterReason: '通过质量筛选' },
      ]);
    } finally {
      videos.upsert = originalUpsert;
      comments.get = originalGet;
      comments.setAnalysis = originalSetAnalysis;
    }
  });

  it('无视频入选时也返回逐视频筛选原因', async () => {
    const originalUpsert = videos.upsert;
    const now = Math.floor(Date.now() / 1000);
    videos.upsert = () => true;
    try {
      const controller = new AppController({
        ctx: {
          async cmdSearch() {
            return [{ aweme_id: '6666666666666666666', desc: 'Claude API 中转站体验', time: now, comments: 60 }];
          },
          async cmdGet() {
            return [
              { cid: 'self-promo', text: '自己建了一个中转站，欢迎体验', time: now },
              { cid: 'model-praise-only', text: 'GPT 这次效果很不错', time: now },
              { cid: 'generic-a', text: '讲得挺清楚', time: now },
              { cid: 'generic-b', text: '学习了', time: now },
              { cid: 'generic-c', text: '感谢分享', time: now },
            ];
          },
        },
        settings: { loadSettings: () => ({
          targetCustomer: '寻找第三方大模型 API 中转服务的用户',
          keywordExpandEnabled: false,
          aiIntentEnabled: true,
          videoTimeRangeDays: 30,
          commentTimeRangeDays: 30,
          minVideoComments: 1,
          sampleCommentsPerVideo: 10,
          minVideoLeadClues: 1,
        }) },
      });
      const job = controller.runCampaign({
        manualKeywords: ['Claude API 中转站'],
        commentKeywords: ['中转', 'GPT'],
        videoCount: 1,
        commentsPerVideo: 5,
        sampleCommentsPerVideo: 10,
        minVideoComments: 1,
        videoTimeRangeDays: 30,
        commentTimeRangeDays: 30,
      });
      const finished = await waitForJob(controller, job.id);
      expect(finished.result.videos).toHaveLength(0);
      expect(finished.result.sampledVideoAudit).toMatchObject([
        {
          awemeId: '6666666666666666666',
          selected: false,
          sampleRecentCount: 5,
          sampleClueHits: 0,
          filterReason: '最近评论样本中只有 0 条明确需求信号，门槛为 1 条',
        },
      ]);
    } finally {
      videos.upsert = originalUpsert;
    }
  });

  it('视频抽样过线但 AI 未确认客户时不显示空评论视频，并说明复核结果', async () => {
    const originalUpsert = videos.upsert;
    const originalGet = comments.get;
    const originalSetAnalysis = comments.setAnalysis;
    const now = Math.floor(Date.now() / 1000);
    videos.upsert = () => true;
    comments.get = () => null;
    comments.setAnalysis = () => true;
    try {
      const controller = new AppController({
        ctx: {
          async cmdSearch() {
            return [{ aweme_id: '7777777777777777777', desc: 'Claude API 中转服务介绍', time: now, comments: 60 }];
          },
          async cmdGet() {
            return [
              { cid: 'relay-price-question', text: '怎么中转的价格都不写的？', time: now },
              { cid: 'generic-1', text: '讲得很清楚', time: now },
              { cid: 'generic-2', text: '学习了', time: now },
              { cid: 'generic-3', text: '支持一下', time: now },
              { cid: 'generic-4', text: '感谢分享', time: now },
            ];
          },
        },
        llm: {
          async complete() {
            return JSON.stringify([{
              cid: 'relay-price-question',
              is_target: false,
              intent_score: 42,
              intent_label: '潜在意向',
              reason: '评论没有明确表达更换或购买意愿',
            }]);
          },
          extractJSON(value) { return JSON.parse(value); },
        },
        settings: { loadSettings: () => ({
          targetCustomer: '寻找第三方大模型 API 中转服务的用户',
          keywordExpandEnabled: false,
          aiIntentEnabled: true,
          intentThreshold: 75,
          videoTimeRangeDays: 30,
          commentTimeRangeDays: 30,
          minVideoComments: 1,
          sampleCommentsPerVideo: 5,
          minVideoLeadClues: 1,
        }) },
      });
      const job = controller.runCampaign({
        manualKeywords: ['Claude API 中转站'],
        commentKeywords: ['中转', '价格'],
        videoCount: 1,
        commentsPerVideo: 5,
        sampleCommentsPerVideo: 5,
        minVideoComments: 1,
        videoTimeRangeDays: 30,
        commentTimeRangeDays: 30,
        intentThreshold: 75,
      });
      const finished = await waitForJob(controller, job.id);
      expect(finished.result.videos).toHaveLength(0);
      expect(finished.result).toMatchObject({
        qualityPassedVideoCount: 1,
        videoCount: 0,
        filterStats: { eligible: 1, qualified: 0, videosWithoutFinalComments: 1 },
        sampledVideoAudit: [{
          awemeId: '7777777777777777777',
          qualityPassed: true,
          selected: false,
          filterReason: '抽样有线索，但 AI 精筛后没有达到 75 分的评论',
        }],
      });
    } finally {
      videos.upsert = originalUpsert;
      comments.get = originalGet;
      comments.setAnalysis = originalSetAnalysis;
    }
  });
});

describe('AppController', () => {
  it('区分桥接在线与抖音账号登录失效', async () => {
    const controller = new AppController({
      ctx: { async bridgeCall() { return { status_code: 2483, status_msg: '请先登录，再继续搜索吧' }; } },
    });
    const session = await controller.checkDouyinSession();
    expect(session).toMatchObject({ connected: true, authenticated: false, statusCode: 2483 });
    expect(session.message).toContain('请先登录抖音');
  });

  it('兼容抖音新版顶层 user_uid 登录结构', async () => {
    const controller = new AppController({
      ctx: { async bridgeCall() { return { status_code: 0, uid: 'current-user', nickname: '测试用户' }; } },
    });
    const session = await controller.checkDouyinSession();
    expect(session).toMatchObject({ connected: true, authenticated: true, statusCode: 0, nickname: '测试用户' });
  });

  it('搜索遇到登录失效立即熔断，不继续请求后续扩展词', async () => {
    let searchCalls = 0;
    const controller = new AppController({
      ctx: {
        async cmdSearch() {
          searchCalls += 1;
          throw new Error('抖音账号未登录或登录态已失效 (status_code=2483)');
        },
      },
      settings: { loadSettings: () => ({
        targetCustomer: '找客户', searchVideoCount: 10, maxCommentsPerVideo: 10,
        keywordExpandEnabled: false, aiIntentEnabled: false,
      }) },
    });
    const job = controller.runCampaign({
      keyword: '找客户',
      manualKeywords: '关键词二\n关键词三',
      keywordExpandEnabled: false,
    });
    await expect(waitForJob(controller, job.id)).rejects.toThrow(/登录检查失败/);
    expect(searchCalls).toBe(1);
    expect(controller.getJob(job.id).status).toBe('failed');
  });

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
      expect(searchCalls[0]).toEqual(['想买演唱会门票', '--count', '20']);
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
          { cid: 'fresh', text: '想买票的新评论', likes: 3, time: 3, user: null },
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

  it('精准找客：人工关键词、视频时间、评论时间和线索词共同过滤，AI 只放行高意向', async () => {
    const originalUpsert = videos.upsert;
    const originalGet = comments.get;
    const originalSetAnalysis = comments.setAnalysis;
    const now = Math.floor(Date.now() / 1000);
    const searchCalls = [];
    const postCalls = [];
    const ctx = {
      async cmdSearch(args) {
        searchCalls.push(args[0]);
        if (args[0] === '薛之谦抢票') {
          return [{ aweme_id: '2222222222222222222', desc: '近期求票', uid: 'u2', time: now - 3600 }];
        }
        return [
          { aweme_id: '0000000000000000001', desc: '一年前的视频', uid: 'old', time: now - 366 * 86400 },
          { aweme_id: '1111111111111111111', desc: '近期票务讨论', uid: 'u1', time: now - 7200 },
        ];
      },
      async cmdGet(args) {
        if (args[0] === '2222222222222222222') {
          return [{ cid: 'replied-before', text: '我也没抢到', time: now - 600, user: null }];
        }
        return [
          { cid: 'too-old', text: '昨天没抢到', time: now - 10 * 86400, user: null },
          { cid: 'keyword-miss', text: '唱得真好', time: now - 300, user: null },
          { cid: 'high-intent', text: '没抢到，哪里还能买票', time: now - 200, user: null },
          { cid: 'low-intent', text: '没抢到也无所谓', time: now - 100, user: null },
        ];
      },
      async cmdPost(args) {
        postCalls.push(args);
        return { cid: `reply-${args[3]}`, status: 'published' };
      },
    };
    const llm = {
      async complete() {
        return JSON.stringify([
          { cid: 'high-intent', is_target: true, intent_score: 92, intent_label: '高意向' },
          { cid: 'low-intent', is_target: false, intent_score: 18, intent_label: '非目标' },
        ]);
      },
      extractJSON(value) { return JSON.parse(value); },
    };
    const settings = { loadSettings: () => ({
      targetCustomer: '最近想买薛之谦演唱会门票但没有抢到的人',
      searchVideoCount: 2,
      maxCommentsPerVideo: 20,
      keywordExpandEnabled: false,
      aiIntentEnabled: true,
      intentThreshold: 70,
      videoTimeRangeDays: 30,
      commentTimeRangeDays: 3,
    }) };

    videos.upsert = () => true;
    comments.get = cid => (cid === 'replied-before' ? { replied: true } : null);
    comments.setAnalysis = () => true;
    try {
      const controller = new AppController({ ctx, settings, llm });
      const job = controller.runCampaign({
        manualKeywords: '薛之谦抢票',
        commentKeywords: '没抢到\n太难抢',
        replyText: '可以看看我整理的信息',
      });
      const finished = await waitForJob(controller, job.id);

      expect(searchCalls).toEqual(expect.arrayContaining(['最近想买薛之谦演唱会门票但没有抢到的人', '薛之谦抢票']));
      expect(finished.result.videos.map(video => video.awemeId)).not.toContain('0000000000000000001');
      expect(finished.result.filterStats).toMatchObject({
        videosTooOld: 1,
        commentsTooOld: 1,
        commentsKeywordMiss: 1,
        previouslyReplied: 1,
        qualified: 1,
      });
      expect(postCalls).toHaveLength(1);
      expect(postCalls[0][3]).toBe('high-intent');
      expect(finished.result.replyStats).toEqual({ target: 2, succeeded: 1, failed: 0, skipped: 1 });
    } finally {
      videos.upsert = originalUpsert;
      comments.get = originalGet;
      comments.setAnalysis = originalSetAnalysis;
    }
  });

  it('多个视频的评论抓取使用受控并发并记录接口耗时', async () => {
    const originalUpsert = videos.upsert;
    let active = 0;
    let maxActive = 0;
    const ctx = {
      async cmdSearch() {
        return ['1', '2', '3'].map(id => ({ aweme_id: id.repeat(19), desc: id, time: 0 }));
      },
      async cmdGet(args) {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise(resolve => setTimeout(resolve, 25));
        active -= 1;
        return [{ cid: `c-${args[0]}`, text: '有需求', time: 0, user: null }];
      },
    };
    videos.upsert = () => true;
    try {
      const controller = new AppController({
        ctx,
        settings: { loadSettings: () => ({ targetCustomer: '目标', keywordExpandEnabled: false, aiIntentEnabled: false }) },
      });
      const job = controller.runCampaign({ videoCount: 3, commentsPerVideo: 1 });
      const finished = await waitForJob(controller, job.id);
      expect(maxActive).toBeGreaterThanOrEqual(2);
      expect(finished.result.metrics.commentCalls).toBe(3);
      expect(finished.result.metrics.commentMs).toBeGreaterThan(0);
    } finally {
      videos.upsert = originalUpsert;
    }
  });

  it('先抽样评论并淘汰互动高但没有需求线索的视频', async () => {
    const originalUpsert = videos.upsert;
    const now = Math.floor(Date.now() / 1000);
    const ctx = {
      async cmdSearch() {
        return [
          { aweme_id: '1111111111111111111', desc: '泛热视频', time: now, comments: 9000, likes: 50000 },
          { aweme_id: '2222222222222222222', desc: '真实求票讨论', time: now, comments: 300, likes: 1000 },
        ];
      },
      async cmdGet(args) {
        return args[0].startsWith('1')
          ? [{ cid: 'generic', text: '唱得太棒了', time: now }]
          : [{ cid: 'lead', text: '没抢到票，哪里可以买', time: now }];
      },
    };
    videos.upsert = () => true;
    try {
      const controller = new AppController({
        ctx,
        settings: { loadSettings: () => ({
          targetCustomer: '想买票的人', keywordExpandEnabled: false, aiIntentEnabled: false,
          videoTimeRangeDays: 30, commentTimeRangeDays: 3,
          minVideoComments: 20, sampleCommentsPerVideo: 20, minVideoLeadClues: 1,
        }) },
      });
      const job = controller.runCampaign({ videoCount: 1, commentsPerVideo: 1 });
      const finished = await waitForJob(controller, job.id);
      expect(finished.result.candidatePoolSize).toBe(2);
      expect(finished.result.videos.map(video => video.awemeId)).toEqual(['2222222222222222222']);
      expect(finished.result.videos[0]).toMatchObject({ sampleClueHits: 1, sampleRecentCount: 1 });
    } finally {
      videos.upsert = originalUpsert;
    }
  });

  it('最终评论上限优先保留抽样阶段命中的需求评论，并使用视频标题补足语境', async () => {
    const originalUpsert = videos.upsert;
    const now = Math.floor(Date.now() / 1000);
    const ctx = {
      async cmdSearch() {
        return [{
          aweme_id: '3333333333333333333',
          desc: '薛之谦成都站二开抢票讨论',
          time: now,
          comments: 80,
        }];
      },
      async cmdGet() {
        return [
          { cid: 'sample-generic-1', text: '唱得真好', time: now },
          { cid: 'sample-generic-2', text: '太喜欢了', time: now },
          { cid: 'sample-generic-3', text: '推荐大家去看', time: now },
          { cid: 'sample-generic-4', text: '现场氛围好棒', time: now },
          { cid: 'sample-signal-1', text: '有没有三开', time: now },
          { cid: 'sample-generic-5', text: '期待下一场', time: now },
          { cid: 'sample-signal-2', text: '没抢到啊', time: now },
        ];
      },
    };
    videos.upsert = () => true;
    try {
      const controller = new AppController({
        ctx,
        settings: { loadSettings: () => ({
          targetCustomer: '想买演唱会门票的人',
          keywordExpandEnabled: false,
          aiIntentEnabled: false,
          videoTimeRangeDays: 30,
          commentTimeRangeDays: 3,
          minVideoComments: 20,
          sampleCommentsPerVideo: 20,
          minVideoLeadClues: 1,
        }) },
      });
      const job = controller.runCampaign({ videoCount: 1, commentsPerVideo: 3 });
      const finished = await waitForJob(controller, job.id);
      const texts = finished.result.videos[0].comments.map(comment => comment.text);
      expect(texts).toEqual(expect.arrayContaining(['有没有三开', '没抢到啊']));
      expect(finished.result.videos[0].commentCount).toBe(2);
      expect(finished.result.filterStats.commentsSignalMiss).toBeGreaterThan(0);
    } finally {
      videos.upsert = originalUpsert;
    }
  });

  it('AI 判定暂时失败时保留规则命中的评论供人工复核，且不自动回复', async () => {
    const originalUpsert = videos.upsert;
    const postCalls = [];
    const now = Math.floor(Date.now() / 1000);
    const ctx = {
      async cmdSearch() {
        return [{ aweme_id: '4444444444444444445', desc: '求票讨论', time: now, comments: 60 }];
      },
      async cmdGet() {
        return [{ cid: 'ai-fallback-comment', text: '没抢到票，求票', time: now }];
      },
      async cmdPost(args) {
        postCalls.push(args);
        return { cid: 'unexpected-reply', status: 'published' };
      },
    };
    videos.upsert = () => true;
    try {
      const controller = new AppController({
        ctx,
        llm: { async complete() { throw new Error('HTTP 503'); } },
        settings: { loadSettings: () => ({
          targetCustomer: '想买演唱会门票的人',
          keywordExpandEnabled: false,
          aiIntentEnabled: true,
          intentThreshold: 65,
          videoTimeRangeDays: 30,
          commentTimeRangeDays: 3,
          minVideoComments: 20,
          sampleCommentsPerVideo: 20,
          minVideoLeadClues: 1,
        }) },
      });
      const job = controller.runCampaign({ videoCount: 1, commentsPerVideo: 1, replyText: '可以帮你看看' });
      const finished = await waitForJob(controller, job.id);
      expect(finished.result.videos[0].comments[0]).toMatchObject({
        cid: 'ai-fallback-comment',
        needsReview: true,
        intentLabel: '待人工复核',
      });
      expect(finished.result.filterStats.aiFallbackComments).toBe(1);
      expect(finished.result.replyStats).toEqual({ target: 0, succeeded: 0, failed: 0, skipped: 0 });
      expect(postCalls).toHaveLength(0);
      expect(finished.result.warnings.some(w => w.includes('转为人工复核'))).toBe(true);
    } finally {
      videos.upsert = originalUpsert;
    }
  });

  it('并发任务命中同一条评论时只允许一次真实回复', async () => {
    const originalGet = comments.get;
    let postCount = 0;
    comments.get = () => null;
    try {
      const controller = new AppController({
        ctx: {
          async cmdPost() {
            postCount += 1;
            await new Promise(resolve => setTimeout(resolve, 30));
            return { cid: 'reply-once', status: 'published' };
          },
        },
      });
      const results = await Promise.all([
        controller._replyOnce('1234567890123456789', 'same-cid', '回复'),
        controller._replyOnce('1234567890123456789', 'same-cid', '回复'),
      ]);
      expect(postCount).toBe(1);
      expect(results.map(item => item.status).sort()).toEqual(['replied', 'skipped']);
    } finally {
      comments.get = originalGet;
    }
  });

  it('同一用户换一条评论后仍会被用户级去重，避免重复触达', async () => {
    const originalGet = comments.get;
    const originalUserGet = users.get;
    let postCount = 0;
    comments.get = () => ({ uid: 'same-user', replied: false });
    users.get = () => ({ uid: 'same-user', replyCount: 1 });
    try {
      const controller = new AppController({
        ctx: { async cmdPost() { postCount += 1; return { status: 'published' }; } },
      });
      const result = await controller._replyOnce('1234567890123456789', 'new-comment-cid', '回复');
      expect(result).toEqual({ status: 'skipped', message: '该用户此前已回复过' });
      expect(postCount).toBe(0);
    } finally {
      comments.get = originalGet;
      users.get = originalUserGet;
    }
  });

  it('找客流程会把历史已回复用户标记并从本轮可跟进线索中排除', async () => {
    const originalUpsert = videos.upsert;
    const originalCommentGet = comments.get;
    const originalUserGet = users.get;
    const now = Math.floor(Date.now() / 1000);
    const ctx = {
      async cmdSearch() {
        return [{ aweme_id: '5555555555555555555', desc: '求票讨论', time: now, comments: 30 }];
      },
      async cmdGet() {
        return [{
          cid: 'repeat-user-comment',
          text: '没抢到票，求票',
          time: now,
          user: { uid: 'repeat-user', nickname: '重复用户' },
        }];
      },
    };
    videos.upsert = () => true;
    comments.get = () => ({ uid: 'repeat-user', replied: false });
    users.get = () => ({ uid: 'repeat-user', replyCount: 1 });
    try {
      const controller = new AppController({
        ctx,
        settings: { loadSettings: () => ({
          targetCustomer: '想买票的人', keywordExpandEnabled: false, aiIntentEnabled: false,
          videoTimeRangeDays: 30, commentTimeRangeDays: 3,
          minVideoComments: 20, sampleCommentsPerVideo: 20, minVideoLeadClues: 1,
        }) },
      });
      const job = controller.runCampaign({ videoCount: 1, commentsPerVideo: 1 });
      const finished = await waitForJob(controller, job.id);
      expect(finished.result.videos[0].comments[0]).toMatchObject({
        cid: 'repeat-user-comment', replied: true, repliedUser: true,
      });
      expect(finished.result.filterStats).toMatchObject({
        previouslyReplied: 1,
        previouslyRepliedUsers: 1,
        eligible: 0,
        qualified: 0,
      });
    } finally {
      videos.upsert = originalUpsert;
      comments.get = originalCommentGet;
      users.get = originalUserGet;
    }
  });

  it('任务列表同时返回所有运行中和已完成任务，并带准确耗时字段', async () => {
    const controller = new AppController({
      ctx: { async cmdGet() { return []; } },
    });
    const first = controller.fetchComments('1234567890123456789', { maxCommentsPerVideo: 1 });
    const second = controller.fetchComments('2234567890123456789', { maxCommentsPerVideo: 1 });
    await Promise.all([waitForJob(controller, first.id), waitForJob(controller, second.id)]);
    const jobs = controller.listJobs();
    expect(jobs.map(job => job.id)).toEqual(expect.arrayContaining([first.id, second.id]));
    expect(jobs.every(job => Number.isFinite(job.durationMs))).toBe(true);
    expect(jobs.every(job => job.details.phase === 'completed')).toBe(true);
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

describe('AppController 模型配置热更新', () => {
  it('正式任务使用前端刚保存的 URL、Key 和模型，无需重启', () => {
    const controller = new AppController({
      config: {
        bridge: { host: '127.0.0.1', port: 19422, token: '' },
        llm: { api_key: 'old-key', base_url: 'https://old.example/v1', model: 'old-model' },
      },
    });
    controller.updateLlmConfig({
      api_key: 'new-key',
      base_url: 'https://new.example/v1',
      model: 'new-model',
    });
    const client = controller._getLlm();
    expect(client.apiKey).toBe('new-key');
    expect(client.baseUrl).toBe('https://new.example/v1');
    expect(client.model).toBe('new-model');
  });
});

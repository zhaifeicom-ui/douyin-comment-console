const { DEFAULT_SETTINGS, normalizeSettings } = require('../lib/app/settings');

describe('工作台时间筛选设置', () => {
  it('默认限制近期视频和近期评论', () => {
    const settings = normalizeSettings({});
    expect(settings.videoTimeRangeDays).toBe(DEFAULT_SETTINGS.videoTimeRangeDays);
    expect(settings.commentTimeRangeDays).toBe(DEFAULT_SETTINGS.commentTimeRangeDays);
    expect(settings.minVideoComments).toBe(20);
    expect(settings.sampleCommentsPerVideo).toBe(20);
    expect(settings.minVideoLeadClues).toBe(1);
  });

  it('允许视频不限时间，但拒绝不支持的时间范围', () => {
    expect(normalizeSettings({ videoTimeRangeDays: 0 }).videoTimeRangeDays).toBe(0);
    expect(normalizeSettings({ videoTimeRangeDays: 45 }).videoTimeRangeDays).toBe(DEFAULT_SETTINGS.videoTimeRangeDays);
  });

  it('校验视频质量筛选范围', () => {
    expect(normalizeSettings({ minVideoComments: 50, sampleCommentsPerVideo: 30, minVideoLeadClues: 2 }))
      .toMatchObject({ minVideoComments: 50, sampleCommentsPerVideo: 30, minVideoLeadClues: 2 });
    expect(normalizeSettings({ sampleCommentsPerVideo: 2 }).sampleCommentsPerVideo).toBe(20);
  });
});

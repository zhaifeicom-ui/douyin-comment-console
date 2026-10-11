const cmdSearch = require('../lib/commands/search');

function makeCtx(result) {
  return {
    audit: {
      startOperation() {},
      endOperation() {},
    },
    async loggedCall() { return result; },
  };
}

describe('search command business status', () => {
  it('把抖音 2483 明确识别为登录失效，而不是成功的空结果', async () => {
    await expect(cmdSearch(makeCtx({ status_code: 2483, status_msg: '请先登录，再继续搜索吧' }), ['关键词']))
      .rejects.toThrow(/请在抖音网页完成登录.*status_code=2483/);
  });

  it('status_code=0 时正常提取视频', async () => {
    const rows = await cmdSearch(makeCtx({
      status_code: 0,
      data: [{ aweme_info: { aweme_id: '123', desc: '标题', author: { nickname: '作者' } } }],
    }), ['关键词']);
    expect(rows).toHaveLength(1);
    expect(rows[0].aweme_id).toBe('123');
  });

  it('保留视频互动数据供质量排序使用', async () => {
    const rows = await cmdSearch(makeCtx({
      status_code: 0,
      data: [{ aweme_info: {
        aweme_id: '456',
        statistics: { play_count: 1000, comment_count: 88, digg_count: 66, share_count: 7, collect_count: 9 },
      } }],
    }), ['关键词']);
    expect(rows[0]).toMatchObject({ plays: 1000, comments: 88, likes: 66, shares: 7, collects: 9 });
  });
});

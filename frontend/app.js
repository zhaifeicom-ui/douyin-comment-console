(() => {
  'use strict';

  const $ = id => document.getElementById(id);

  const elements = {
    connectionBadge: $('connectionBadge'),
    currentViewLabel: $('currentViewLabel'),
    metricVideos: $('metricVideos'),
    metricComments: $('metricComments'),
    metricQualified: $('metricQualified'),
    metricPending: $('metricPending'),
    campaignTab: $('campaignTab'),
    manualTab: $('manualTab'),
    campaignView: $('campaignView'),
    manualView: $('manualView'),
    campaignForm: $('campaignForm'),
    campaignKeyword: $('campaignKeyword'),
    campaignVideoCount: $('campaignVideoCount'),
    campaignCommentsPerVideo: $('campaignCommentsPerVideo'),
    campaignExpandEnabled: $('campaignExpandEnabled'),
    campaignExpandCount: $('campaignExpandCount'),
    campaignReplyText: $('campaignReplyText'),
    campaignRunButton: $('campaignRunButton'),
    connectionHint: $('connectionHint'),
    campaignMessage: $('campaignMessage'),
    campaignProgress: $('campaignProgress'),
    campaignProgressFill: $('campaignProgressFill'),
    campaignStats: $('campaignStats'),
    keywordBlock: $('keywordBlock'),
    keywordChips: $('keywordChips'),
    campaignWarnings: $('campaignWarnings'),
    campaignVideoList: $('campaignVideoList'),
    discoverForm: $('discoverForm'),
    discoverKeyword: $('discoverKeyword'),
    discoverConfig: $('discoverConfig'),
    discoverHint: $('discoverHint'),
    discoverButton: $('discoverButton'),
    directLink: $('directLink'),
    resolveButton: $('resolveButton'),
    discoverMessage: $('discoverMessage'),
    videoList: $('videoList'),
    selectedVideoTitle: $('selectedVideoTitle'),
    selectedVideoMeta: $('selectedVideoMeta'),
    analyzeCommentsButton: $('analyzeCommentsButton'),
    repliedFilter: $('repliedFilter'),
    commentSearch: $('commentSearch'),
    intentFilter: $('intentFilter'),
    commentsSummary: $('commentsSummary'),
    intentThresholdBadge: $('intentThresholdBadge'),
    videoInboxCount: $('videoInboxCount'),
    refreshCommentsButton: $('refreshCommentsButton'),
    commentsMessage: $('commentsMessage'),
    commentsEmpty: $('commentsEmpty'),
    commentList: $('commentList'),
    settingsButton: $('settingsButton'),
    settingsDialog: $('settingsDialog'),
    settingsForm: $('settingsForm'),
    closeSettingsButton: $('closeSettingsButton'),
    cancelSettingsButton: $('cancelSettingsButton'),
    saveSettingsButton: $('saveSettingsButton'),
    settingsMessage: $('settingsMessage'),
    targetCustomer: $('targetCustomer'),
    searchVideoCount: $('searchVideoCount'),
    maxComments: $('maxComments'),
    timeRange: $('timeRange'),
    intentThreshold: $('intentThreshold'),
    intentAnalysisMode: $('intentAnalysisMode'),
    replyTone: $('replyTone'),
    replyCta: $('replyCta'),
    aiIntentEnabled: $('aiIntentEnabled'),
    keywordExpandEnabled: $('keywordExpandEnabled'),
    keywordExpandCount: $('keywordExpandCount'),
    defaultReplyText: $('defaultReplyText'),
  };

  const state = {
    settings: null,
    savedSettings: null,
    settingsSeeded: false,
    connected: false,
    lastConnected: null,
    videos: [],
    selectedAwemeId: null,
    selectedVideo: null,
    comments: [],
    campaign: null,
  };

  function setMessage(node, text, type = '') {
    node.textContent = text;
    node.className = `inline-message ${type}`.trim();
  }

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value === null || value === undefined) continue;
      if (key === 'text') node.textContent = value;
      else if (key === 'className') node.className = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value);
    }
    for (const child of [].concat(children)) {
      if (child) node.append(child);
    }
    return node;
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
      ...options,
    });
    const payload = await response.json().catch(() => ({ ok: false, error: '服务器返回了无法解析的数据' }));
    if (response.status === 401) {
      location.href = '/app';
      throw new Error(payload.error || '本地会话已过期');
    }
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || `请求失败 (${response.status})`);
    }
    return payload;
  }

  function formatTime(value) {
    const n = Number(value || 0);
    if (!n) return '时间未知';
    const date = new Date(n > 1e12 ? n : n * 1000);
    return new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  function formatNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? new Intl.NumberFormat('zh-CN').format(n) : '0';
  }

  function intentTone(score, comment = {}) {
    const value = Number(score);
    if (!Number.isFinite(value)) return 'none';
    const threshold = Number(state.settings?.intentThreshold ?? 65);
    if (comment.isTarget || value >= Math.max(80, threshold + 15)) return 'high';
    if (value >= threshold) return 'mid';
    if (value >= 35) return 'low';
    return 'none';
  }

  function qualified(comment) {
    const threshold = Number(state.settings?.intentThreshold ?? 65);
    if (comment?.isTarget === false) return false;
    return Boolean(comment?.isTarget === true || Number(comment?.intentScore) >= threshold);
  }

  function shortId(value) {
    return String(value || '').slice(0, 8);
  }

  function initial(name) {
    const text = String(name || '用').trim();
    return text.slice(0, 1).toUpperCase();
  }

  function setProgressBar(percent) {
    const p = Math.min(100, Math.max(0, Number(percent) || 0));
    elements.campaignProgressFill.style.width = `${p}%`;
    elements.campaignProgress.setAttribute('aria-valuenow', String(p));
  }

  // ── 视图切换 ──

  function switchView(view) {
    const isCampaign = view === 'campaign';
    elements.campaignView.hidden = !isCampaign;
    elements.manualView.hidden = isCampaign;
    elements.campaignTab.classList.toggle('is-active', isCampaign);
    elements.campaignTab.setAttribute('aria-selected', String(isCampaign));
    elements.manualTab.classList.toggle('is-active', !isCampaign);
    elements.manualTab.setAttribute('aria-selected', String(!isCampaign));
    if (elements.currentViewLabel) {
      elements.currentViewLabel.textContent = isCampaign ? '智能找客' : '线索审核';
    }
  }

  async function loadOverview() {
    try {
      const payload = await api('/api/app/overview');
      const overview = payload.overview || {};
      if (elements.metricVideos) elements.metricVideos.textContent = formatNumber(overview.videos || 0);
      if (elements.metricComments) elements.metricComments.textContent = formatNumber(overview.comments || 0);
      if (elements.metricQualified) elements.metricQualified.textContent = formatNumber(overview.qualifiedLeads || 0);
      if (elements.metricPending) elements.metricPending.textContent = formatNumber(overview.pendingReplies || 0);
      if (elements.intentThresholdBadge) {
        elements.intentThresholdBadge.textContent = `意向阈值 ${overview.intentThreshold ?? state.settings?.intentThreshold ?? 65}`;
      }
    } catch (error) {
      // 概览是增强信息，Bridge 启动初期失败不应阻断主工作流。
      if (elements.metricVideos && elements.metricVideos.textContent === '—') {
        elements.metricVideos.textContent = '0';
        elements.metricComments.textContent = '0';
        elements.metricQualified.textContent = '0';
        elements.metricPending.textContent = '0';
      }
    }
  }

  // ── 一体化运营 ──

  function renderCampaignResult() {
    const result = state.campaign?.result || null;
    const videos = result?.videos || [];

    elements.campaignStats.textContent = result
      ? `视频 ${result.videoCount} · 候选评论 ${videos.reduce((s, v) => s + (v.commentCount || 0), 0)} · 成功 ${result.replyStats.succeeded} · 失败 ${result.replyStats.failed} · 跳过 ${result.replyStats.skipped}`
      : '';

    elements.keywordBlock.hidden = !(result?.keywords?.length > 0);
    elements.keywordChips.replaceChildren();
    for (const keyword of result?.keywords || []) {
      elements.keywordChips.append(el('span', { className: 'keyword-chip', text: keyword }));
    }

    const warnings = result?.warnings || [];
    elements.campaignWarnings.hidden = warnings.length === 0;
    elements.campaignWarnings.textContent = warnings.length
      ? warnings.map((w, i) => `${i + 1}. ${w}`).join('　')
      : '';

    elements.campaignVideoList.replaceChildren();
    if (!result) {
      elements.campaignVideoList.append(
        el('div', { className: 'empty-state', text: '还没有执行结果。填写左侧表单后点击“一键启动并统一回复”。' }),
      );
      return;
    }
    if (videos.length === 0) {
      elements.campaignVideoList.append(
        el('div', { className: 'empty-state', text: '执行完成，但没有检索到候选视频，请换一个客户关键词再试。' }),
      );
      return;
    }

    for (const video of videos) {
      const replies = video.replies || [];
      const succeeded = replies.filter(r => r.status === 'replied').length;
      const failed = replies.filter(r => r.status === 'failed').length;
      const skipped = replies.filter(r => r.status === 'skipped').length;

      const card = el('article', { className: 'campaign-video-card' }, [
        el('div', { className: 'campaign-video-head' }, [
          el('div', { className: 'campaign-video-title-wrap' }, [
            el('h3', { className: 'campaign-video-title', text: video.title || `视频 ${shortId(video.awemeId)}` }),
            el('p', {
              className: 'campaign-video-meta',
              text: `aweme ${shortId(video.awemeId)} · ${video.authorNickname || '未知作者'}`,
            }),
          ]),
          el('div', { className: 'campaign-video-stats' }, [
            el('span', { text: `${video.commentCount} 条候选评论` }),
            el('span', { className: succeeded > 0 ? 'stat-ok' : '', text: `成功 ${succeeded}` }),
            el('span', { className: failed > 0 ? 'stat-err' : '', text: `失败 ${failed}` }),
            el('span', { className: skipped > 0 ? 'stat-warn' : '', text: `跳过 ${skipped}` }),
          ]),
        ]),
      ]);

      if (video.fetchError) {
        card.append(el('p', { className: 'video-error', text: `候选评论抓取失败：${video.fetchError}` }));
      }

      for (const comment of video.comments || []) {
        const reply = replies.find(item => item.cid === comment.cid);
        card.append(el('div', { className: 'campaign-comment-row' }, [
          el('div', { className: 'campaign-comment-text' }, [
            el('span', { className: 'comment-user-name', text: comment.user?.nickname || '用户' }),
            el('span', { className: 'campaign-comment-body', text: comment.text || '[贴纸/无文字评论]' }),
          ]),
          reply
            ? el('span', {
              className: `reply-chip ${reply.status}`,
              text: reply.status === 'replied' ? '已回复'
                : reply.status === 'failed' ? '回复失败'
                  : `跳过 · ${reply.message || ''}`,
            })
            : el('span', { className: 'reply-chip none', text: '未回复' }),
        ]));
      }

      elements.campaignVideoList.append(card);
    }
  }

  async function startCampaign(event) {
    event.preventDefault();
    if (!state.connected) {
      setMessage(elements.campaignMessage, '抖音未连接，无法启动：请先打开 www.douyin.com 主站并确认右上角显示“抖音已连接”', 'error');
      updateConnectionUI();
      return;
    }
    const keyword = elements.campaignKeyword.value.trim();
    if (!keyword) {
      setMessage(elements.campaignMessage, '请先填写客户关键词', 'error');
      elements.campaignKeyword.focus();
      return;
    }
    const videoCount = Number(elements.campaignVideoCount.value);
    const commentsPerVideo = Number(elements.campaignCommentsPerVideo.value);
    const expandCount = Number(elements.campaignExpandCount.value);
    const replyText = elements.campaignReplyText.value.trim();
    if (!Number.isInteger(videoCount) || videoCount < 1 || videoCount > 20) {
      setMessage(elements.campaignMessage, '候选视频数必须是 1-20 的整数', 'error');
      return;
    }
    if (!Number.isInteger(commentsPerVideo) || commentsPerVideo < 0 || commentsPerVideo > 100) {
      setMessage(elements.campaignMessage, '每个视频评论数必须是 0-100 的整数', 'error');
      return;
    }

    elements.campaignRunButton.disabled = true;
    elements.campaignProgress.hidden = false;
    setProgressBar(0);
    state.campaign = { result: null };
    renderCampaignResult();
    setMessage(elements.campaignMessage, '任务已提交…');

    try {
      const payload = await api('/api/app/campaign/run', {
        method: 'POST',
        body: JSON.stringify({
          keyword,
          videoCount,
          commentsPerVideo,
          keywordExpandEnabled: elements.campaignExpandEnabled.checked,
          keywordExpandCount: expandCount,
          replyText,
        }),
      });
      const finished = await waitForJob(payload.job, job => {
        setMessage(elements.campaignMessage, `${job.message} · ${job.progress}%`);
        setProgressBar(job.progress);
      });
      state.campaign = finished;
      setProgressBar(100);
      renderCampaignResult();
      await loadOverview();
      const succeeded = finished.result?.replyStats?.succeeded || 0;
      const failed = finished.result?.replyStats?.failed || 0;
      setMessage(
        elements.campaignMessage,
        finished.result?.replyText
          ? `执行完成：筛选 ${finished.result.videoCount} 个候选视频，回复成功 ${succeeded}，失败 ${failed}`
          : `执行完成：筛选 ${finished.result.videoCount} 个候选视频（未填写回复文案，未执行回复）`,
      );
    } catch (error) {
      setMessage(elements.campaignMessage, error.message, 'error');
    } finally {
      elements.campaignRunButton.disabled = !state.connected;
    }
  }

  // ── 设置 ──

  function renderDiscoverConfig() {
    const count = Number(state.settings?.searchVideoCount ?? 5);
    const max = Number(state.settings?.maxCommentsPerVideo ?? 5);
    elements.discoverConfig.textContent = `候选视频 ${count} 个 · 每个候选视频评论 ${max === 0 ? '不限（全部）' : `${max} 条`}`;
  }

  function applySettings(settings) {
    const previousTarget = state.settings?.targetCustomer || '';
    state.settings = settings;
    state.savedSettings = { ...settings };
    elements.targetCustomer.value = settings.targetCustomer || '';
    elements.searchVideoCount.value = String(settings.searchVideoCount ?? 5);
    elements.maxComments.value = String(settings.maxCommentsPerVideo ?? 5);
    elements.timeRange.value = String(settings.commentTimeRangeDays ?? 2);
    elements.intentThreshold.value = String(settings.intentThreshold ?? 65);
    elements.intentAnalysisMode.value = settings.intentAnalysisMode || 'text-only';
    elements.replyTone.value = settings.replyTone || '自然、真诚、简洁';
    elements.replyCta.value = settings.replyCta || '';
    elements.aiIntentEnabled.checked = settings.aiIntentEnabled !== false;
    elements.keywordExpandEnabled.checked = settings.keywordExpandEnabled !== false;
    elements.keywordExpandCount.value = String(settings.keywordExpandCount ?? 10);
    elements.defaultReplyText.value = settings.defaultReplyText || '';

    const discoverValue = elements.discoverKeyword.value.trim();
    if (!discoverValue || discoverValue === previousTarget) {
      elements.discoverKeyword.value = settings.targetCustomer || '';
    }
    renderDiscoverConfig();

    // 一体化表单只在首次载入时用设置填充默认值，之后尊重用户当前输入
    if (!state.settingsSeeded) {
      state.settingsSeeded = true;
      elements.campaignKeyword.value = settings.targetCustomer || '';
      elements.campaignVideoCount.value = String(settings.searchVideoCount ?? 5);
      elements.campaignCommentsPerVideo.value = String(settings.maxCommentsPerVideo ?? 5);
      elements.campaignExpandEnabled.checked = settings.keywordExpandEnabled !== false;
      elements.campaignExpandCount.value = String(settings.keywordExpandCount ?? 10);
      elements.campaignReplyText.value = settings.defaultReplyText || '';
      elements.campaignExpandCount.disabled = !elements.campaignExpandEnabled.checked;
    }
    if (elements.intentThresholdBadge) {
      elements.intentThresholdBadge.textContent = `意向阈值 ${settings.intentThreshold ?? 65}`;
    }
    renderDiscoverConfig();
  }

  function readSettingsForm() {
    return {
      targetCustomer: elements.targetCustomer.value.trim(),
      searchVideoCount: Number(elements.searchVideoCount.value),
      maxCommentsPerVideo: Number(elements.maxComments.value),
      commentTimeRangeDays: Number(elements.timeRange.value),
      intentThreshold: Number(elements.intentThreshold.value),
      intentAnalysisMode: elements.intentAnalysisMode.value,
      replyTone: elements.replyTone.value.trim(),
      replyCta: elements.replyCta.value.trim(),
      aiIntentEnabled: elements.aiIntentEnabled.checked,
      keywordExpandEnabled: elements.keywordExpandEnabled.checked,
      keywordExpandCount: Number(elements.keywordExpandCount.value),
      defaultReplyText: elements.defaultReplyText.value.trim(),
    };
  }

  async function loadSettings() {
    const payload = await api('/api/app/settings');
    applySettings(payload.settings);
  }

  function openSettings() {
    if (state.savedSettings) applySettings(state.savedSettings);
    if (typeof elements.settingsDialog.showModal === 'function') {
      elements.settingsDialog.showModal();
    } else {
      elements.settingsDialog.setAttribute('open', '');
    }
  }

  function closeSettings() {
    if (typeof elements.settingsDialog.close === 'function') {
      elements.settingsDialog.close();
    } else {
      elements.settingsDialog.removeAttribute('open');
    }
  }

  async function saveSettings(event) {
    event.preventDefault();
    setMessage(elements.settingsMessage, '正在保存…');
    try {
      const payload = await api('/api/app/settings', {
        method: 'POST',
        body: JSON.stringify(readSettingsForm()),
      });
      applySettings(payload.settings);
      setMessage(elements.settingsMessage, '设置已保存');
      setTimeout(closeSettings, 350);
    } catch (error) {
      setMessage(elements.settingsMessage, error.message, 'error');
    }
  }

  // ── 连接状态 ──

  function updateConnectionUI() {
    const changed = state.lastConnected !== state.connected;
    state.lastConnected = state.connected;
    const hint = state.connected
      ? ''
      : '抖音未连接：请先在浏览器打开 www.douyin.com 主站，确认右上角显示“抖音已连接”后再启动。';
    elements.campaignRunButton.disabled = !state.connected;
    elements.campaignRunButton.title = state.connected ? '' : '抖音未连接，无法启动';
    elements.discoverButton.disabled = !state.connected;
    elements.discoverButton.title = state.connected ? '' : '抖音未连接，无法筛选';
    if (elements.analyzeCommentsButton) {
      elements.analyzeCommentsButton.disabled = !state.connected || !state.selectedAwemeId || state.settings?.aiIntentEnabled === false;
      elements.analyzeCommentsButton.title = !state.connected
        ? '抖音未连接，无法分析'
        : !state.selectedAwemeId ? '请先选择视频'
          : state.settings?.aiIntentEnabled === false ? '设置中已关闭 AI 意向判定' : '';
    }
    if (!changed) return;
    elements.connectionHint.hidden = state.connected;
    elements.connectionHint.textContent = hint;
    elements.discoverHint.hidden = state.connected;
    elements.discoverHint.textContent = hint;
  }

  async function checkConnection() {
    try {
      const payload = await api('/api/status');
      const count = Number(payload.totalConnections || 0);
      state.connected = count > 0;
      elements.connectionBadge.textContent = count > 0 ? `抖音已连接 · ${count}` : '等待抖音连接';
      elements.connectionBadge.className = `status-badge ${count > 0 ? 'status-ok' : 'status-muted'}`;
      updateConnectionUI();
    } catch (_) {
      state.connected = false;
      elements.connectionBadge.textContent = 'Bridge 未连接';
      elements.connectionBadge.className = 'status-badge status-error';
      updateConnectionUI();
    }
  }

  // ── 单视频精细回复（手动视图） ──

  async function loadVideos() {
    const payload = await api('/api/app/videos');
    state.videos = payload.videos || [];
    renderVideos();
  }

  function renderVideos() {
    if (elements.videoInboxCount) elements.videoInboxCount.textContent = formatNumber(state.videos.length);
    elements.videoList.replaceChildren();
    if (state.videos.length === 0) {
      elements.videoList.append(
        el('div', { className: 'empty-state', text: '暂无候选视频。完成一次视频筛选后会显示在这里。' }),
      );
      return;
    }

    for (const video of state.videos) {
      const title = video.title || `视频 ${shortId(video.awemeId)}`;
      const item = el('button', {
        className: `video-item ${state.selectedAwemeId === video.awemeId ? 'selected' : ''}`,
        type: 'button',
      }, [
        el('p', { className: 'video-title', text: title }),
        el('div', { className: 'video-meta' }, [
          el('span', { text: shortId(video.awemeId) }),
          el('span', { text: `${video.commentCount || 0} 条候选评论` }),
        ]),
      ]);
      item.addEventListener('click', () => selectVideo(video.awemeId, video));
      elements.videoList.append(item);
    }
  }

  function updateSelectedHeader() {
    if (!state.selectedAwemeId) {
      elements.selectedVideoTitle.textContent = '请先选择视频';
      elements.selectedVideoMeta.textContent = '';
      return;
    }
    const video = state.selectedVideo || {};
    elements.selectedVideoTitle.textContent = video.title || `视频 ${shortId(state.selectedAwemeId)}`;
    elements.selectedVideoMeta.textContent = `aweme_id ${state.selectedAwemeId}`;
  }

  function selectVideo(awemeId, video = null) {
    state.selectedAwemeId = awemeId;
    state.selectedVideo = video || state.videos.find(item => item.awemeId === awemeId) || { awemeId };
    updateSelectedHeader();
    renderVideos();
    updateConnectionUI();
    loadComments();
  }

  async function loadComments() {
    if (!state.selectedAwemeId) {
      elements.commentList.replaceChildren();
      elements.commentsEmpty.hidden = false;
      elements.commentsSummary.textContent = '选择视频后开始分析';
      return;
    }
    elements.commentsEmpty.hidden = true;
    setMessage(elements.commentsMessage, '正在读取评论…');
    try {
      const params = new URLSearchParams({ aweme_id: state.selectedAwemeId });
      if (elements.repliedFilter.value) params.set('replied', elements.repliedFilter.value);
      if (elements.commentSearch.value.trim()) params.set('q', elements.commentSearch.value.trim());
      if (elements.intentFilter.value === 'qualified') {
        params.set('intent_min', String(state.settings?.intentThreshold ?? 65));
        params.set('target_only', 'true');
      } else if (elements.intentFilter.value === 'analyzed') {
        params.set('has_intent', 'true');
      } else if (elements.intentFilter.value === 'pending') {
        params.set('replied', 'false');
      }
      const payload = await api(`/api/app/comments?${params.toString()}`);
      state.comments = payload.comments || [];
      renderComments();
      const qualifiedCount = state.comments.filter(qualified).length;
      elements.commentsSummary.textContent = state.comments.length
        ? `当前 ${formatNumber(state.comments.length)} 条 · 高意向 ${formatNumber(qualifiedCount)} 条`
        : '当前筛选条件下暂无评论';
      setMessage(elements.commentsMessage, state.comments.length ? `已载入 ${state.comments.length} 条候选评论` : '暂无候选评论');
    } catch (error) {
      state.comments = [];
      renderComments();
      elements.commentsSummary.textContent = '评论读取失败';
      setMessage(elements.commentsMessage, error.message, 'error');
    }
  }

  function renderComments() {
    elements.commentList.replaceChildren();
    elements.commentsEmpty.hidden = state.comments.length > 0;
    if (state.comments.length === 0) return;

    for (const comment of state.comments) {
      elements.commentList.append(buildCommentCard(comment));
    }
  }

  async function analyzeSelectedComments() {
    if (!state.selectedAwemeId) {
      setMessage(elements.commentsMessage, '请先选择一个视频', 'error');
      return;
    }
    if (state.settings?.aiIntentEnabled === false) {
      setMessage(elements.commentsMessage, '设置中已关闭 AI 意向判定，请先在设置里开启', 'warn');
      return;
    }
    elements.analyzeCommentsButton.disabled = true;
    setMessage(elements.commentsMessage, '意向分析任务已提交…');
    try {
      const payload = await api(`/api/app/videos/${encodeURIComponent(state.selectedAwemeId)}/analyze`, {
        method: 'POST',
        body: JSON.stringify({
          mode: state.settings?.intentAnalysisMode || 'text-only',
          intentThreshold: Number(state.settings?.intentThreshold ?? 65),
          maxComments: Number(state.settings?.maxCommentsPerVideo ?? 200) || 200,
          targetCustomer: state.settings?.targetCustomer || '',
        }),
      });
      const finished = await waitForJob(payload.job, job => {
        setMessage(elements.commentsMessage, `${job.message} · ${job.progress}%`);
      });
      const result = finished.result || {};
      setMessage(
        elements.commentsMessage,
        `分析完成：已判定 ${result.analyzedCount || 0} 条，高意向 ${result.highIntentCount || 0} 条${result.warnings?.length ? `；${result.warnings.join('；')}` : ''}`,
        result.warnings?.length ? 'warn' : '',
      );
      if (result.video?.title && state.selectedVideo) state.selectedVideo.title = result.video.title;
      await Promise.all([loadComments(), loadVideos(), loadOverview()]);
    } catch (error) {
      setMessage(elements.commentsMessage, error.message, 'error');
    } finally {
      updateConnectionUI();
    }
  }

  async function draftComment(comment, textarea, draftButton, status) {
    if (!state.selectedAwemeId || !comment?.cid || comment.replied) return;
    draftButton.disabled = true;
    status.textContent = '正在生成草稿…';
    status.className = 'reply-state';
    try {
      const payload = await api(`/api/app/comments/${encodeURIComponent(comment.cid)}/draft`, {
        method: 'POST',
        body: JSON.stringify({
          aweme_id: state.selectedAwemeId,
          targetCustomer: state.settings?.targetCustomer || '',
          replyTone: state.settings?.replyTone || '',
          replyCta: state.settings?.replyCta || '',
        }),
      });
      const finished = await waitForJob(payload.job, job => {
        status.textContent = `${job.message} · ${job.progress}%`;
      });
      const draft = finished.result?.reply || '';
      if (!draft) throw new Error('AI 没有生成有效草稿');
      textarea.value = draft;
      comment.replyDraft = draft;
      status.textContent = '草稿已生成，请审核后发布';
      status.className = 'reply-state warn';
    } catch (error) {
      status.textContent = error.message || '草稿生成失败';
      status.className = 'reply-state error';
    } finally {
      draftButton.disabled = false;
    }
  }

  function buildCommentCard(comment) {
    const status = el('div', { className: 'reply-state' });
    const textarea = el('textarea', {
      className: 'reply-textarea',
      placeholder: comment.replied ? '这条评论已经回复过' : '输入自定义回复…',
      maxlength: '1000',
    });
    textarea.value = comment.replyDraft || '';
    const draftButton = el('button', {
      className: 'button button-secondary draft-button',
      type: 'button',
      text: '✦ 生成草稿',
    });
    const submit = el('button', {
      className: 'button button-primary',
      type: 'button',
      text: comment.replied ? '已回复' : '发布回复',
    });

    const score = Number(comment.intentScore);
    const hasIntent = Number.isFinite(score);
    const isQualified = qualified(comment);
    const tone = intentTone(score, comment);

    if (comment.replied) {
      textarea.disabled = true;
      draftButton.disabled = true;
      submit.disabled = true;
      status.textContent = comment.replyCid ? `已回复 · reply_cid ${shortId(comment.replyCid)}` : '已回复';
    }

    draftButton.addEventListener('click', () => draftComment(comment, textarea, draftButton, status));

    submit.addEventListener('click', async () => {
      const text = textarea.value.trim();
      if (!text) {
        status.textContent = '请输入回复内容';
        status.className = 'reply-state error';
        textarea.focus();
        return;
      }
      submit.disabled = true;
      status.textContent = '正在提交回复…';
      status.className = 'reply-state';
      try {
        const payload = await api(`/api/app/comments/${encodeURIComponent(comment.cid)}/reply`, {
          method: 'POST',
          body: JSON.stringify({
            aweme_id: state.selectedAwemeId,
            text,
          }),
        });
        await waitForJob(payload.job, job => {
          status.textContent = `${job.message} · ${job.progress}%`;
        });
        status.textContent = '回复已发布';
        status.className = 'reply-state';
        await Promise.all([loadComments(), loadVideos(), loadOverview()]);
      } catch (error) {
        status.textContent = error.message || '回复失败';
        status.className = 'reply-state error';
        submit.disabled = false;
      }
    });

    return el('article', {
      className: `comment-card ${comment.replied ? 'replied' : ''} ${isQualified ? 'is-qualified' : ''}`,
    }, [
      el('div', { className: 'comment-top' }, [
        el('div', { className: 'comment-user' }, [
          el('span', { className: 'user-avatar', text: initial(comment.user?.nickname) }),
          el('span', { className: 'user-name', text: comment.user?.nickname || `用户 ${shortId(comment.uid)}` }),
        ]),
        el('div', { className: 'comment-stats' }, [
          el('span', { text: `${comment.digg || 0} 赞` }),
          el('span', { text: formatTime(comment.createdAt) }),
        ]),
      ]),
      el('p', { className: 'comment-text', text: comment.text || '[贴纸评论]' }),
      hasIntent
        ? el('div', { className: 'intent-row' }, [
          el('span', { className: `intent-pill ${tone}`, text: `${comment.intentLabel || '已判定'} · ${score}` }),
          comment.intentStage ? el('span', { className: 'stage-pill', text: comment.intentStage }) : null,
          comment.priority ? el('span', { className: 'priority-pill', text: `优先级 ${comment.priority}/5` }) : null,
        ])
        : el('div', { className: 'intent-row' }, [
          el('span', { className: 'intent-pill none', text: '尚未判定' }),
          el('span', { className: 'stage-pill', text: '点击 AI 判定意向' }),
        ]),
      hasIntent && comment.intentReason
        ? el('p', { className: 'intent-evidence' }, [
          el('strong', { text: '判定依据：' }),
          document.createTextNode(comment.intentReason),
        ])
        : null,
      el('div', { className: 'comment-footer' }, [
        textarea,
        el('div', { className: 'reply-controls' }, [
          draftButton,
          submit,
          status,
        ]),
      ]),
    ]);
  }

  function waitForJob(job, onUpdate = () => {}) {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const maxAttempts = 400;

      async function tick() {
        attempts += 1;
        let latest;
        try {
          const payload = await api(`/api/app/jobs/${encodeURIComponent(job.id)}`);
          latest = payload.job;
        } catch (error) {
          if (attempts >= maxAttempts) {
            reject(error);
            return;
          }
          setTimeout(tick, 1000);
          return;
        }

        onUpdate(latest);
        if (latest.status === 'succeeded') {
          resolve(latest);
          return;
        }
        if (latest.status === 'failed') {
          reject(new Error(latest.error || '任务失败'));
          return;
        }
        if (attempts >= maxAttempts) {
          reject(new Error('任务等待超时，请稍后刷新查看结果'));
          return;
        }
        setTimeout(tick, 800);
      }

      tick();
    });
  }

  async function startDiscover(event) {
    event.preventDefault();
    if (!state.connected) {
      setMessage(elements.discoverMessage, '抖音未连接，无法筛选：请先打开 www.douyin.com 主站并确认右上角显示“抖音已连接”', 'error');
      updateConnectionUI();
      return;
    }
    const keyword = elements.discoverKeyword.value.trim();
    if (!keyword) {
      setMessage(elements.discoverMessage, '请填写目标客户关键词，用于筛选候选视频', 'error');
      elements.discoverKeyword.focus();
      return;
    }

    elements.discoverButton.disabled = true;
    setMessage(elements.discoverMessage, '任务已提交…');
    try {
      const payload = await api('/api/app/videos/discover', {
        method: 'POST',
        body: JSON.stringify({
          keyword,
          count: Number(state.settings.searchVideoCount ?? 5),
          maxCommentsPerVideo: Number(state.settings.maxCommentsPerVideo ?? 5),
        }),
      });
      const finished = await waitForJob(payload.job, job => {
        setMessage(elements.discoverMessage, `${job.message} · ${job.progress}%`);
      });
      setMessage(
        elements.discoverMessage,
        finished.result?.videos?.length
          ? `完成，筛选出 ${finished.result.videos.length} 个候选视频`
          : '完成，没有筛选出候选视频',
      );
      await loadVideos();
      await loadOverview();
      if (state.videos.length > 0) {
        selectVideo(state.videos[0].awemeId, state.videos[0]);
      }
    } catch (error) {
      setMessage(elements.discoverMessage, error.message, 'error');
    } finally {
      elements.discoverButton.disabled = !state.connected;
    }
  }

  async function fetchSelectedComments() {
    if (!state.selectedAwemeId) return;
    elements.refreshCommentsButton.disabled = true;
    setMessage(elements.commentsMessage, '正在抓取候选评论…');
    try {
      const payload = await api(`/api/app/videos/${encodeURIComponent(state.selectedAwemeId)}/fetch`, {
        method: 'POST',
        body: JSON.stringify({
          maxCommentsPerVideo: Number(state.settings.maxCommentsPerVideo ?? 5),
        }),
      });
      await waitForJob(payload.job, job => {
        setMessage(elements.commentsMessage, `${job.message} · ${job.progress}%`);
      });
      await Promise.all([loadComments(), loadVideos(), loadOverview()]);
    } catch (error) {
      setMessage(elements.commentsMessage, error.message, 'error');
    } finally {
      elements.refreshCommentsButton.disabled = false;
    }
  }

  async function resolveDirectVideo() {
    const input = elements.directLink.value.trim();
    if (!input) {
      setMessage(elements.discoverMessage, '请先粘贴视频链接或 aweme_id', 'error');
      elements.directLink.focus();
      return;
    }
    elements.resolveButton.disabled = true;
    setMessage(elements.discoverMessage, '正在解析链接…');
    try {
      const payload = await api('/api/app/videos/resolve', {
        method: 'POST',
        body: JSON.stringify({ input }),
      });
      state.selectedAwemeId = payload.video.awemeId;
      state.selectedVideo = { awemeId: payload.video.awemeId, title: '' };
      updateSelectedHeader();
      renderVideos();
      setMessage(elements.discoverMessage, '链接解析成功，开始抓取候选评论');
      await fetchSelectedComments();
    } catch (error) {
      setMessage(elements.discoverMessage, error.message, 'error');
    } finally {
      elements.resolveButton.disabled = false;
    }
  }

  // ── 事件绑定 ──

  elements.campaignTab.addEventListener('click', () => switchView('campaign'));
  elements.manualTab.addEventListener('click', () => switchView('manual'));
  elements.campaignForm.addEventListener('submit', startCampaign);
  elements.campaignExpandEnabled.addEventListener('change', () => {
    elements.campaignExpandCount.disabled = !elements.campaignExpandEnabled.checked;
  });
  elements.discoverForm.addEventListener('submit', startDiscover);
  elements.resolveButton.addEventListener('click', resolveDirectVideo);
  elements.refreshCommentsButton.addEventListener('click', fetchSelectedComments);
  elements.analyzeCommentsButton.addEventListener('click', analyzeSelectedComments);
  elements.repliedFilter.addEventListener('change', loadComments);
  elements.intentFilter.addEventListener('change', loadComments);
  let commentSearchTimer = null;
  elements.commentSearch.addEventListener('input', () => {
    clearTimeout(commentSearchTimer);
    commentSearchTimer = setTimeout(loadComments, 260);
  });
  elements.settingsButton.addEventListener('click', openSettings);
  elements.closeSettingsButton.addEventListener('click', closeSettings);
  elements.cancelSettingsButton.addEventListener('click', closeSettings);
  elements.settingsForm.addEventListener('submit', saveSettings);

  renderCampaignResult();
  setInterval(checkConnection, 3000);
  Promise.all([loadSettings(), checkConnection(), loadVideos(), loadOverview()]).then(() => {
    updateConnectionUI();
  }).catch(error => {
    setMessage(elements.campaignMessage, error.message, 'error');
    checkConnection();
  });
})();

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
    metricAccounts: $('metricAccounts'),
    metricWorkflows: $('metricWorkflows'),
    campaignTab: $('campaignTab'),
    manualTab: $('manualTab'),
    automationTab: $('automationTab'),
    accountsTab: $('accountsTab'),
    inboxTab: $('inboxTab'),
    campaignView: $('campaignView'),
    manualView: $('manualView'),
    automationView: $('automationView'),
    accountsView: $('accountsView'),
    inboxView: $('inboxView'),
    campaignForm: $('campaignForm'),
    campaignKeyword: $('campaignKeyword'),
    campaignManualKeywords: $('campaignManualKeywords'),
    campaignCommentKeywords: $('campaignCommentKeywords'),
    campaignVideoCount: $('campaignVideoCount'),
    campaignCommentsPerVideo: $('campaignCommentsPerVideo'),
    campaignVideoTimeRange: $('campaignVideoTimeRange'),
    campaignCommentTimeRange: $('campaignCommentTimeRange'),
    campaignExpandEnabled: $('campaignExpandEnabled'),
    campaignExpandCount: $('campaignExpandCount'),
    campaignAiFilterEnabled: $('campaignAiFilterEnabled'),
    campaignIntentThreshold: $('campaignIntentThreshold'),
    campaignReplyText: $('campaignReplyText'),
    campaignDeliveryMode: $('campaignDeliveryMode'),
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
    tutorialButton: $('tutorialButton'),
    taskCenterButton: $('taskCenterButton'),
    taskActiveBadge: $('taskActiveBadge'),
    taskCenterDialog: $('taskCenterDialog'),
    closeTaskCenterButton: $('closeTaskCenterButton'),
    dismissTaskCenterButton: $('dismissTaskCenterButton'),
    refreshTasksButton: $('refreshTasksButton'),
    taskCenterSummary: $('taskCenterSummary'),
    taskList: $('taskList'),
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
    videoTimeRange: $('videoTimeRange'),
    intentThreshold: $('intentThreshold'),
    intentAnalysisMode: $('intentAnalysisMode'),
    replyTone: $('replyTone'),
    replyCta: $('replyCta'),
    aiIntentEnabled: $('aiIntentEnabled'),
    keywordExpandEnabled: $('keywordExpandEnabled'),
    keywordExpandCount: $('keywordExpandCount'),
    minVideoComments: $('minVideoComments'),
    sampleCommentsPerVideo: $('sampleCommentsPerVideo'),
    minVideoLeadClues: $('minVideoLeadClues'),
    defaultReplyText: $('defaultReplyText'),
    llmConfigBadge: $('llmConfigBadge'),
    llmModeCustom: $('llmModeCustom'),
    llmModeManaged: $('llmModeManaged'),
    managedModeCard: $('managedModeCard'),
    managedModeHint: $('managedModeHint'),
    customApiFields: $('customApiFields'),
    managedServiceFields: $('managedServiceFields'),
    llmBaseUrl: $('llmBaseUrl'),
    llmApiKey: $('llmApiKey'),
    llmKeyHint: $('llmKeyHint'),
    toggleApiKeyButton: $('toggleApiKeyButton'),
    llmModel: $('llmModel'),
    llmModelOptions: $('llmModelOptions'),
    fetchModelsButton: $('fetchModelsButton'),
    testLlmButton: $('testLlmButton'),
    llmTestMessage: $('llmTestMessage'),
    tutorialDialog: $('tutorialDialog'),
    closeTutorialButton: $('closeTutorialButton'),
    finishTutorialButton: $('finishTutorialButton'),
    tutorialConfigureModel: $('tutorialConfigureModel'),
    tutorialModelStatus: $('tutorialModelStatus'),
    tutorialBridgeStatus: $('tutorialBridgeStatus'),
    automationSummary: $('automationSummary'),
    automationStatus: $('automationStatus'),
    workflowList: $('workflowList'),
    newWorkflowButton: $('newWorkflowButton'),
    workflowForm: $('workflowForm'),
    workflowId: $('workflowId'),
    workflowEditorTitle: $('workflowEditorTitle'),
    workflowName: $('workflowName'),
    workflowKeywords: $('workflowKeywords'),
    workflowCommentKeywords: $('workflowCommentKeywords'),
    workflowAccountPicker: $('workflowAccountPicker'),
    refreshAccountsButton: $('refreshAccountsButton'),
    workflowActionComment: $('workflowActionComment'),
    workflowActionDm: $('workflowActionDm'),
    workflowActionLike: $('workflowActionLike'),
    workflowActionFollow: $('workflowActionFollow'),
    workflowCommentTemplate: $('workflowCommentTemplate'),
    workflowDmTemplate: $('workflowDmTemplate'),
    workflowTrigger: $('workflowTrigger'),
    workflowMode: $('workflowMode'),
    workflowSchedule: $('workflowSchedule'),
    workflowApproval: $('workflowApproval'),
    workflowCommentLimit: $('workflowCommentLimit'),
    workflowDmLimit: $('workflowDmLimit'),
    workflowMessage: $('workflowMessage'),
    saveWorkflowButton: $('saveWorkflowButton'),
    deleteWorkflowButton: $('deleteWorkflowButton'),
    accountsSummary: $('accountsSummary'),
    accountList: $('accountList'),
    refreshAccountsPageButton: $('refreshAccountsPageButton'),
    refreshInboxButton: $('refreshInboxButton'),
    newInboxButton: $('newInboxButton'),
    inboxAccountFilter: $('inboxAccountFilter'),
    inboxNewConversationForm: $('inboxNewConversationForm'),
    inboxNewAccount: $('inboxNewAccount'),
    inboxNewPeerUid: $('inboxNewPeerUid'),
    inboxNewText: $('inboxNewText'),
    inboxNewMessage: $('inboxNewMessage'),
    inboxNewSendButton: $('inboxNewSendButton'),
    inboxConversationList: $('inboxConversationList'),
    inboxSelectedTitle: $('inboxSelectedTitle'),
    inboxSelectedMeta: $('inboxSelectedMeta'),
    inboxMessageBadge: $('inboxMessageBadge'),
    inboxMessageList: $('inboxMessageList'),
    inboxEvidencePanel: $('inboxEvidencePanel'),
    inboxEvidenceList: $('inboxEvidenceList'),
    inboxComposeForm: $('inboxComposeForm'),
    inboxComposeText: $('inboxComposeText'),
    inboxComposeMessage: $('inboxComposeMessage'),
    inboxSendButton: $('inboxSendButton'),
  };

  const state = {
    settings: null,
    savedSettings: null,
    settingsSeeded: false,
    connected: false,
    bridgeConnected: false,
    connectionCount: 0,
    douyinAuthenticated: null,
    douyinSessionCheckedAt: 0,
    douyinSessionLoading: false,
    lastConnected: null,
    videos: [],
    selectedAwemeId: null,
    selectedVideo: null,
    comments: [],
    campaign: null,
    jobs: [],
    jobsLoading: false,
    llmConfig: null,
    llmModels: [],
    accounts: [],
    workflows: [],
    inbox: { accounts: [], messages: [], conversations: [], unreadCount: 0 },
    selectedConversationId: null,
    workflowDraft: null,
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

  function formatDuration(ms) {
    const seconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
    if (seconds < 60) return `${seconds} 秒`;
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return `${minutes} 分 ${rest} 秒`;
  }

  function jobTypeLabel(type) {
    const labels = {
      'campaign:run': '精准找客',
      'videos:discover': '搜索视频',
      'comments:fetch': '抓取评论',
      'comments:analyze': 'AI 意向判定',
      'comment:draft': '生成回复草稿',
      'comment:reply': '发布回复',
      'dm:send': '发送私信',
      'workflow:run': '自动化工作流',
    };
    return labels[type] || type || '后台任务';
  }

  function jobStatusLabel(status) {
    return ({ queued: '排队中', running: '执行中', succeeded: '已完成', failed: '失败' })[status] || status;
  }

  function closeTaskCenter() {
    if (typeof elements.taskCenterDialog.close === 'function') elements.taskCenterDialog.close();
    else elements.taskCenterDialog.removeAttribute('open');
  }

  function openTaskCenter() {
    renderTaskCenter();
    if (typeof elements.taskCenterDialog.showModal === 'function') {
      if (!elements.taskCenterDialog.open) elements.taskCenterDialog.showModal();
    } else {
      elements.taskCenterDialog.setAttribute('open', '');
    }
  }

  function showJobResult(job) {
    if (job.type === 'campaign:run' && job.result) {
      state.campaign = job;
      renderCampaignResult();
      switchView('campaign');
      setProgressBar(100);
      elements.campaignProgress.hidden = false;
      setMessage(elements.campaignMessage, `已打开任务结果：${job.meta?.keyword || '精准找客'}`);
      closeTaskCenter();
    }
  }

  function renderTaskCenter() {
    const jobs = state.jobs || [];
    const active = jobs.filter(job => job.status === 'queued' || job.status === 'running');
    elements.taskActiveBadge.hidden = active.length === 0;
    elements.taskActiveBadge.textContent = String(active.length);
    elements.taskCenterButton.classList.toggle('has-active-tasks', active.length > 0);
    elements.taskCenterSummary.textContent = jobs.length
      ? `共 ${jobs.length} 个任务 · 执行中 ${active.length} · 已完成 ${jobs.filter(job => job.status === 'succeeded').length} · 失败 ${jobs.filter(job => job.status === 'failed').length}`
      : '当前还没有后台任务';
    elements.taskList.replaceChildren();
    if (jobs.length === 0) {
      elements.taskList.append(el('div', { className: 'empty-state', text: '启动一次找客或分析任务后，准确进度会显示在这里。' }));
      return;
    }

    for (const job of jobs) {
      const details = job.details || {};
      const metrics = details.metrics || job.result?.metrics || {};
      const filters = details.filterStats || job.result?.filterStats || {};
      const progress = Math.max(0, Math.min(100, Number(job.progress || 0)));
      const countText = Number(details.total) > 0 ? `${details.current || 0}/${details.total}` : '';
      const perfParts = [];
      if (metrics.searchCalls) perfParts.push(`搜索 ${metrics.searchCalls} 次 / ${formatDuration(metrics.searchMs)}`);
      if (metrics.commentCalls) perfParts.push(`评论接口 ${metrics.commentCalls} 次 / ${formatDuration(metrics.commentMs)}`);
      if (metrics.aiCalls) perfParts.push(`AI ${metrics.aiCalls} 次 / ${formatDuration(metrics.aiMs)}`);
      if (metrics.replyCalls) perfParts.push(`安全回复队列 ${metrics.replyCalls} 次 / ${formatDuration(metrics.replyMs)}`);
      if (metrics.dmCalls) perfParts.push(`私信 ${metrics.dmCalls} 次 / ${formatDuration(metrics.dmMs)}`);
      const filterParts = [];
      if (filters.searchResultsRaw != null) filterParts.push(`搜索返回 ${filters.searchResultsRaw || 0}`);
      if (filters.videosDuplicate) filterParts.push(`视频去重 ${filters.videosDuplicate}`);
      if (filters.videosTooOld) filterParts.push(`过期视频 ${filters.videosTooOld}`);
      if (filters.commentsFetched != null) filterParts.push(`抓取 ${filters.commentsFetched || 0}`);
      if (filters.eligible != null) filterParts.push(`初筛 ${filters.eligible || 0}`);
      if (filters.commentsSignalMiss) filterParts.push(`泛评论过滤 ${filters.commentsSignalMiss}`);
      if (filters.videosWithoutClues) filterParts.push(`无需求线索视频 ${filters.videosWithoutClues}`);
      if (filters.sampleExpandedVideos) {
        filterParts.push(`扩展抽样 ${filters.sampleExpandedVideos} 个视频${filters.sampleExpandedComments ? `（+${filters.sampleExpandedComments} 条）` : ''}`);
      }
      if (filters.sampleExpansionFailed) filterParts.push(`扩展抽样失败 ${filters.sampleExpansionFailed}`);
      if (filters.aiFallbackComments) filterParts.push(`AI失败待复核 ${filters.aiFallbackComments}`);
      if (filters.qualified != null) filterParts.push(`高意向 ${filters.qualified || 0}`);
      if (filters.uniqueLeads != null) filterParts.push(`客户 ${filters.uniqueLeads || 0}`);
      if (filters.duplicateLeads) filterParts.push(`重复客户评论 ${filters.duplicateLeads}`);
      if (filters.previouslyReplied) filterParts.push(`已回复跳过 ${filters.previouslyReplied}`);
      if (filters.previouslyRepliedUsers) filterParts.push(`已回复用户 ${filters.previouslyRepliedUsers}`);

      const card = el('article', { className: `task-card task-${job.status}` }, [
        el('div', { className: 'task-card-head' }, [
          el('div', {}, [
            el('strong', { text: `${jobTypeLabel(job.type)} · ${job.meta?.keyword || shortId(job.id)}` }),
            el('span', { text: `${formatTime(job.createdAt)} · 已用 ${formatDuration(job.durationMs)}` }),
          ]),
          el('span', { className: `task-status task-status-${job.status}`, text: jobStatusLabel(job.status) }),
        ]),
        el('div', { className: 'task-progress-line' }, [
          el('div', { className: 'task-progress-track' }, [
            el('i', { style: `width:${progress}%` }),
          ]),
          el('b', { text: `${progress}%${countText ? ` · ${countText}` : ''}` }),
        ]),
        el('p', { className: 'task-message', text: job.error || job.message || '等待更新' }),
        perfParts.length ? el('p', { className: 'task-metrics', text: perfParts.join('　') }) : null,
        filterParts.length ? el('p', { className: 'task-filters', text: filterParts.join('　') }) : null,
      ]);
      if (job.status === 'succeeded' && job.result && job.type === 'campaign:run') {
        const viewButton = el('button', { className: 'button button-secondary task-result-button', type: 'button', text: '查看本次结果' });
        viewButton.addEventListener('click', () => showJobResult(job));
        card.append(viewButton);
      }
      elements.taskList.append(card);
    }
  }

  async function loadJobs() {
    if (state.jobsLoading) return;
    state.jobsLoading = true;
    try {
      const payload = await api('/api/app/jobs?limit=100');
      state.jobs = payload.jobs || [];
      renderTaskCenter();
    } catch (_) {
      // 任务中心轮询失败不会影响正在执行的后台任务。
    } finally {
      state.jobsLoading = false;
    }
  }

  // ── 账号池 / 自动化工作流 / 消息聚合 ──

  function accountLabel(account) {
    return account.nickname || account.title || `抖音账号 ${Number(account.index || 0) + 1}`;
  }

  async function loadAccounts(probe = false) {
    try {
      const payload = await api(`/api/app/accounts${probe ? '?probe=1' : ''}`);
      state.accounts = payload.accounts || [];
      renderAccountPicker();
      renderAccountList();
      if (elements.metricAccounts) {
        elements.metricAccounts.textContent = formatNumber(state.accounts.filter(item => item.alive && item.authenticated !== false).length);
      }
      if (elements.automationStatus) {
        elements.automationStatus.textContent = state.accounts.length ? `${state.accounts.length} 个账号已接入` : '等待抖音账号接入';
      }
    } catch (_) {
      state.accounts = [];
      renderAccountPicker();
      renderAccountList();
      if (elements.metricAccounts) elements.metricAccounts.textContent = '0';
    }
  }

  function renderAccountPicker() {
    if (!elements.workflowAccountPicker) return;
    const selected = new Set([...elements.workflowAccountPicker.querySelectorAll('input[type="checkbox"]:checked')].map(input => input.value));
    elements.workflowAccountPicker.replaceChildren();
    if (!state.accounts.length) {
      elements.workflowAccountPicker.append(el('span', { className: 'muted-copy', text: '还没有检测到抖音账号，请先打开并登录抖音标签页。' }));
      return;
    }
    for (const account of state.accounts) {
      const id = account.id;
      const input = el('input', { type: 'checkbox', value: id });
      input.checked = selected.has(id) || (state.workflowDraft?.accountIds || []).includes(id);
      input.dataset.index = String(account.index);
      const status = account.status === 'online' ? '在线' : account.status === 'login_required' ? '需登录' : '离线';
      elements.workflowAccountPicker.append(el('label', { className: `account-picker-item ${account.status !== 'online' ? 'is-muted' : ''}` }, [
        input,
        el('span', { className: 'account-avatar', text: initial(accountLabel(account)) }),
        el('span', { className: 'account-picker-copy' }, [
          el('strong', { text: accountLabel(account) }),
          el('small', { text: `${account.uid ? `uid ${shortId(account.uid)}` : '未读取身份'} · ${status}` }),
        ]),
      ]));
    }
  }

  function renderAccountList() {
    if (!elements.accountList || !elements.accountsSummary) return;
    const online = state.accounts.filter(account => account.alive && account.authenticated !== false).length;
    elements.accountsSummary.textContent = state.accounts.length
      ? `共 ${state.accounts.length} 个账号槽位 · 在线 ${online} · 每个标签页独立接收命令；关闭页面后会从池中移除。`
      : '暂未检测到账号。请在浏览器打开 www.douyin.com，确认油猴连接脚本已运行，然后刷新。';
    elements.accountList.replaceChildren();
    if (!state.accounts.length) {
      elements.accountList.append(el('div', { className: 'empty-state account-empty', text: '没有在线账号' }));
      return;
    }
    for (const account of state.accounts) {
      const statusClass = account.status === 'online' ? 'online' : account.status === 'login_required' ? 'login-required' : 'offline';
      const card = el('article', { className: `account-card account-${statusClass}` }, [
        el('div', { className: 'account-card-head' }, [
          el('div', { className: 'account-identity' }, [
            el('span', { className: 'account-avatar account-avatar-large', text: initial(accountLabel(account)) }),
            el('div', {}, [el('h3', { text: accountLabel(account) }), el('p', { text: account.uid ? `uid ${account.uid}` : `连接 ${shortId(account.id)}` })]),
          ]),
          el('span', { className: `account-status account-status-${statusClass}`, text: statusClass === 'online' ? '在线' : statusClass === 'login-required' ? '需登录' : '离线' }),
        ]),
        el('div', { className: 'account-card-stats' }, [
          el('span', { text: `连接方式 ${account.transport === 'websocket' ? 'WebSocket' : '轮询'}` }),
          el('span', { text: account.lastActivity ? `心跳 ${formatTime(account.lastActivity)}` : '心跳未知' }),
        ]),
        el('div', { className: 'account-card-actions' }, [
          el('button', { className: 'button button-secondary account-inbox-button', type: 'button', text: '查看消息' }),
          el('span', { className: 'account-limit-note', text: '额度由工作流分别设置' }),
        ]),
      ]);
      card.querySelector('.account-inbox-button').addEventListener('click', () => {
        if (elements.inboxAccountFilter) elements.inboxAccountFilter.value = account.id;
        switchView('inbox');
        loadInbox(account.id);
      });
      elements.accountList.append(card);
    }
  }

  async function loadWorkflows() {
    try {
      const payload = await api('/api/app/workflows');
      state.workflows = payload.workflows || [];
      renderWorkflowList();
      if (elements.metricWorkflows) elements.metricWorkflows.textContent = formatNumber(state.workflows.filter(item => item.status === 'active').length);
    } catch (_) {
      state.workflows = [];
      renderWorkflowList();
      if (elements.metricWorkflows) elements.metricWorkflows.textContent = '0';
    }
  }

  function workflowStatusLabel(status) {
    return ({ active: '运行中', paused: '已暂停', draft: '草稿' })[status] || status;
  }

  function renderWorkflowList() {
    if (!elements.workflowList || !elements.automationSummary) return;
    const active = state.workflows.filter(item => item.status === 'active').length;
    elements.automationSummary.textContent = `共 ${state.workflows.length} 条工作流 · 运行中 ${active} · 默认审核模式会先保存草稿，不会静默发出评论或私信。`;
    elements.workflowList.replaceChildren();
    if (!state.workflows.length) {
      elements.workflowList.append(el('div', { className: 'empty-state', text: '还没有工作流。右侧创建第一条自动化规则。' }));
      return;
    }
    for (const workflow of state.workflows) {
      const actionNames = Object.entries(workflow.actions || {}).filter(([, enabled]) => enabled).map(([key]) => ({ comment: '评论', dm: '私信', like: '点赞', follow: '关注' }[key] || key));
      const card = el('article', { className: `workflow-card workflow-${workflow.status}` }, [
        el('div', { className: 'workflow-card-head' }, [
          el('div', {}, [el('h3', { text: workflow.name }), el('p', { text: workflow.description || `${workflow.searchKeywords.slice(0, 2).join('、')} · ${workflow.accountIds.length || workflow.accountIndexes.length} 个账号` })]),
          el('span', { className: `workflow-status workflow-status-${workflow.status}`, text: workflowStatusLabel(workflow.status) }),
        ]),
        el('div', { className: 'workflow-chip-row' }, [
          ...actionNames.map(name => el('span', { className: 'workflow-chip', text: name })),
          el('span', { className: 'workflow-chip workflow-chip-soft', text: workflow.requireApproval ? '人工审核' : '自动执行' }),
        ]),
        el('div', { className: 'workflow-card-stats' }, [
          el('span', { text: `运行 ${workflow.stats?.runCount || 0} 次` }),
          el('span', { text: `线索 ${workflow.stats?.leads || 0}` }),
          el('span', { text: workflow.stats?.lastRunAt ? `上次 ${formatTime(workflow.stats.lastRunAt)}` : '尚未运行' }),
        ]),
        el('div', { className: 'workflow-card-actions' }, [
          el('button', { className: 'button button-secondary workflow-edit-button', type: 'button', text: '编辑' }),
          el('button', { className: 'button button-secondary workflow-toggle-button', type: 'button', text: workflow.status === 'active' ? '暂停' : '启用' }),
          el('button', { className: 'button button-primary workflow-run-button', type: 'button', text: '立即运行' }),
        ]),
      ]);
      card.querySelector('.workflow-edit-button').addEventListener('click', () => fillWorkflowEditor(workflow));
      card.querySelector('.workflow-toggle-button').addEventListener('click', () => toggleWorkflow(workflow));
      card.querySelector('.workflow-run-button').addEventListener('click', () => runWorkflow(workflow));
      elements.workflowList.append(card);
    }
  }

  function resetWorkflowEditor() {
    state.workflowDraft = null;
    elements.workflowId.value = '';
    elements.workflowEditorTitle.textContent = '新建获客工作流';
    elements.workflowName.value = '';
    elements.workflowKeywords.value = '';
    elements.workflowCommentKeywords.value = '';
    elements.workflowActionComment.checked = false;
    elements.workflowActionDm.checked = false;
    elements.workflowActionLike.checked = false;
    elements.workflowActionFollow.checked = false;
    elements.workflowCommentTemplate.value = '';
    elements.workflowDmTemplate.value = '';
    elements.workflowTrigger.value = 'schedule';
    elements.workflowMode.value = 'draft';
    elements.workflowSchedule.value = '30';
    elements.workflowApproval.checked = true;
    elements.workflowCommentLimit.value = '10';
    elements.workflowDmLimit.value = '5';
    elements.deleteWorkflowButton.hidden = true;
    setMessage(elements.workflowMessage, '');
    renderAccountPicker();
  }

  function fillWorkflowEditor(workflow) {
    state.workflowDraft = workflow;
    elements.workflowId.value = workflow.id;
    elements.workflowEditorTitle.textContent = '编辑自动化工作流';
    elements.workflowName.value = workflow.name || '';
    elements.workflowKeywords.value = (workflow.searchKeywords || []).join('\n');
    elements.workflowCommentKeywords.value = (workflow.commentKeywords || []).join('\n');
    for (const [id, key] of [['workflowActionComment', 'comment'], ['workflowActionDm', 'dm'], ['workflowActionLike', 'like'], ['workflowActionFollow', 'follow']]) elements[id].checked = !!workflow.actions?.[key];
    elements.workflowCommentTemplate.value = workflow.commentTemplate || '';
    elements.workflowDmTemplate.value = workflow.dmTemplate || '';
    elements.workflowTrigger.value = workflow.trigger || 'manual';
    elements.workflowMode.value = workflow.replyMode || 'draft';
    elements.workflowSchedule.value = String(workflow.scheduleMinutes || 30);
    elements.workflowApproval.checked = workflow.requireApproval !== false;
    elements.workflowCommentLimit.value = String(workflow.limits?.commentsPerAccount ?? 10);
    elements.workflowDmLimit.value = String(workflow.limits?.dmsPerAccount ?? 5);
    elements.deleteWorkflowButton.hidden = false;
    renderAccountPicker();
    setMessage(elements.workflowMessage, '正在编辑这条工作流');
  }

  function selectedWorkflowAccountIds() {
    return [...elements.workflowAccountPicker.querySelectorAll('input[type="checkbox"]:checked')].map(input => input.value);
  }

  function selectedWorkflowAccountIndexes() {
    return [...elements.workflowAccountPicker.querySelectorAll('input[type="checkbox"]:checked')]
      .map(input => Number(input.dataset.index))
      .filter(index => Number.isInteger(index));
  }

  function collectWorkflowPayload() {
    return {
      id: elements.workflowId.value || undefined,
      name: elements.workflowName.value.trim(),
      searchKeywords: elements.workflowKeywords.value,
      commentKeywords: elements.workflowCommentKeywords.value,
      accountIds: selectedWorkflowAccountIds(),
      accountIndexes: selectedWorkflowAccountIndexes(),
      actions: {
        comment: elements.workflowActionComment.checked,
        dm: elements.workflowActionDm.checked,
        like: elements.workflowActionLike.checked,
        follow: elements.workflowActionFollow.checked,
      },
      commentTemplate: elements.workflowCommentTemplate.value,
      dmTemplate: elements.workflowDmTemplate.value,
      trigger: elements.workflowTrigger.value,
      replyMode: elements.workflowMode.value,
      scheduleMinutes: Number(elements.workflowSchedule.value),
      requireApproval: elements.workflowApproval.checked,
      limits: {
        commentsPerAccount: Number(elements.workflowCommentLimit.value),
        dmsPerAccount: Number(elements.workflowDmLimit.value),
      },
      status: state.workflowDraft?.status || 'draft',
    };
  }

  async function saveWorkflow(event) {
    event.preventDefault();
    const payload = collectWorkflowPayload();
    if (!payload.name) return setMessage(elements.workflowMessage, '请先填写工作流名称', 'error');
    elements.saveWorkflowButton.disabled = true;
    setMessage(elements.workflowMessage, '正在保存…');
    try {
      const response = await api(payload.id ? '/api/app/workflows' : '/api/app/workflows', {
        method: payload.id ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
      setMessage(elements.workflowMessage, payload.id ? '工作流已更新' : '工作流已创建');
      await loadWorkflows();
      fillWorkflowEditor(response.workflow);
    } catch (error) {
      setMessage(elements.workflowMessage, error.message, 'error');
    } finally {
      elements.saveWorkflowButton.disabled = false;
    }
  }

  async function toggleWorkflow(workflow) {
    try {
      await api(`/api/app/workflows/${encodeURIComponent(workflow.id)}/toggle`, { method: 'POST', body: JSON.stringify({ active: workflow.status !== 'active' }) });
      await loadWorkflows();
    } catch (error) {
      setMessage(elements.workflowMessage, error.message, 'error');
    }
  }

  async function runWorkflow(workflow) {
    const button = [...elements.workflowList.querySelectorAll('.workflow-run-button')].find(node => node.closest('.workflow-card')?.querySelector('h3')?.textContent === workflow.name);
    if (button) button.disabled = true;
    try {
      const payload = await api(`/api/app/workflows/${encodeURIComponent(workflow.id)}/run`, { method: 'POST', body: JSON.stringify({}) });
      setMessage(elements.workflowMessage, `任务已提交：${payload.job?.id || '后台执行中'}`);
      await loadJobs();
    } catch (error) {
      setMessage(elements.workflowMessage, error.message, 'error');
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function deleteWorkflow() {
    const id = elements.workflowId.value;
    if (!id) return;
    if (!window.confirm('确定删除这条工作流吗？已完成的任务记录不会删除。')) return;
    try {
      await api(`/api/app/workflows/${encodeURIComponent(id)}`, { method: 'DELETE' });
      resetWorkflowEditor();
      await loadWorkflows();
    } catch (error) {
      setMessage(elements.workflowMessage, error.message, 'error');
    }
  }

  async function loadInbox(accountId = elements.inboxAccountFilter?.value || '') {
    if (!elements.inboxConversationList) return;
    try {
      const payload = await api(`/api/app/inbox${accountId ? `?account_id=${encodeURIComponent(accountId)}` : ''}`);
      if (elements.inboxAccountFilter) elements.inboxAccountFilter.dataset.loadedValue = accountId || '';
      state.inbox = payload;
      renderInbox();
    } catch (error) {
      setMessage(elements.workflowMessage || elements.campaignMessage, error.message, 'error');
    }
  }

  async function startNewInboxConversation(event) {
    event?.preventDefault();
    const accountId = elements.inboxNewAccount?.value || elements.inboxAccountFilter?.value || '';
    const peerUid = elements.inboxNewPeerUid?.value.trim() || '';
    const text = elements.inboxNewText?.value.trim() || '';
    if (!accountId) {
      setMessage(elements.inboxNewMessage, '请先选择一个已连接的抖音账号', 'error');
      return;
    }
    if (!/^\S{3,}$/.test(peerUid)) {
      setMessage(elements.inboxNewMessage, '请输入有效的抖音用户 UID', 'error');
      return;
    }
    if (!text) {
      setMessage(elements.inboxNewMessage, '请输入第一条私信内容', 'error');
      return;
    }
    elements.inboxNewSendButton.disabled = true;
    setMessage(elements.inboxNewMessage, '正在创建真实抖音私信…');
    try {
      const payload = await api('/api/app/inbox/send', {
        method: 'POST',
        body: JSON.stringify({ account_id: accountId, peer_uid: peerUid, text }),
      });
      const finished = await waitForJob(payload.job, job => setMessage(elements.inboxNewMessage, `${job.message} · ${job.progress}%`));
      const result = finished.result || {};
      state.selectedConversationId = `${result.accountId || accountId}::${result.conversationId || `peer:${peerUid}`}`;
      elements.inboxNewPeerUid.value = '';
      elements.inboxNewText.value = '';
      setMessage(elements.inboxNewMessage, '私信已发送，会话已加入收件箱');
      await loadInbox(elements.inboxAccountFilter?.value || '');
    } catch (error) {
      setMessage(elements.inboxNewMessage, error.message || '发起私信失败', 'error');
    } finally {
      elements.inboxNewSendButton.disabled = false;
    }
  }

  function renderInbox() {
    if (!elements.inboxConversationList) return;
    const accounts = state.inbox.accounts || [];
    elements.inboxAccountFilter.replaceChildren(el('option', { value: '', text: '全部账号' }));
    for (const account of accounts) elements.inboxAccountFilter.append(el('option', { value: account.id, text: accountLabel(account) }));
    if (elements.inboxAccountFilter && elements.inboxAccountFilter.value !== (elements.inboxAccountFilter.dataset.loadedValue || '')) {
      const requested = elements.inboxAccountFilter.dataset.loadedValue || '';
      if ([...elements.inboxAccountFilter.options].some(option => option.value === requested)) elements.inboxAccountFilter.value = requested;
    }
    if (elements.inboxNewAccount) {
      const previous = elements.inboxNewAccount.value || elements.inboxAccountFilter?.value || '';
      elements.inboxNewAccount.replaceChildren();
      for (const account of accounts) {
        elements.inboxNewAccount.append(el('option', { value: account.id, text: accountLabel(account) }));
      }
      const preferred = previous || accounts.find(account => account.alive && account.authenticated !== false)?.id || accounts[0]?.id || '';
      if ([...elements.inboxNewAccount.options].some(option => option.value === preferred)) elements.inboxNewAccount.value = preferred;
      elements.inboxNewAccount.disabled = accounts.length === 0;
      if (elements.inboxNewSendButton) elements.inboxNewSendButton.disabled = accounts.length === 0;
    }
    elements.inboxConversationList.replaceChildren();
    const conversations = state.inbox.conversations || [];
    if (!conversations.length) {
      elements.inboxConversationList.append(el('div', { className: 'empty-state compact-empty', text: '还没有真实私信会话' }));
    } else {
      for (const conversation of conversations) {
        const key = `${conversation.accountId}::${conversation.conversationId}`;
        const latest = (conversation.messages || []).at(-1);
        const item = el('button', { className: `inbox-conversation-item ${state.selectedConversationId === key ? 'is-selected' : ''}`, type: 'button' }, [
          el('span', { className: 'account-avatar', text: initial(conversation.nickname) }),
          el('span', { className: 'inbox-conversation-copy' }, [
            el('strong', { text: conversation.nickname || `用户 ${shortId(conversation.uid)}` }),
            el('small', { text: latest?.content || '暂无消息内容' }),
            el('small', { className: 'inbox-conversation-account', text: conversation.accountName || '抖音账号' }),
          ]),
          conversation.unreadCount ? el('b', { className: 'inbox-reply-count inbox-unread-count', text: String(conversation.unreadCount) }) : null,
        ]);
        item.addEventListener('click', () => {
          state.selectedConversationId = key;
          renderInbox();
          api('/api/app/inbox/read', {
            method: 'POST',
            body: JSON.stringify({ account_id: conversation.accountId, conversation_id: conversation.conversationId }),
          }).then(() => loadInbox(elements.inboxAccountFilter?.value || '')).catch(() => {});
        });
        elements.inboxConversationList.append(item);
      }
    }
    const selected = conversations.find(item => `${item.accountId}::${item.conversationId}` === state.selectedConversationId) || conversations[0];
    if (selected) {
      state.selectedConversationId = `${selected.accountId}::${selected.conversationId}`;
      elements.inboxSelectedTitle.textContent = selected.nickname || `用户 ${shortId(selected.uid)}`;
      elements.inboxSelectedMeta.textContent = `uid ${selected.uid || '未知'} · ${selected.accountName || '抖音账号'} · ${selected.messages?.length || 0} 条私信`;
    } else {
      state.selectedConversationId = null;
      elements.inboxSelectedTitle.textContent = '选择一个私信会话';
      elements.inboxSelectedMeta.textContent = '';
    }
    elements.inboxMessageBadge.textContent = `${Number(state.inbox.unreadCount || 0)} 条未读私信`;
    elements.inboxMessageList.replaceChildren();
    const selectedMessages = selected?.messages || [];
    if (!selectedMessages.length) {
      elements.inboxMessageList.append(el('div', { className: 'empty-state compact-empty', text: '该会话还没有可显示的消息' }));
    } else {
      for (const message of selectedMessages) {
        const outbound = message.direction === 'outbound';
        elements.inboxMessageList.append(el('article', { className: `inbox-message-card inbox-dm-message ${outbound ? 'is-outbound' : 'is-inbound'}` }, [
          el('div', { className: 'inbox-message-meta', text: `${outbound ? '我' : (message.senderNickname || selected.nickname || `用户 ${shortId(message.senderUid)}`)} · ${formatTime(message.createdAt)}` }),
          el('p', { text: message.content || '[非文本消息]' }),
          el('span', { className: `inbox-message-status ${message.status === 'sent' ? 'is-done' : ''}`, text: outbound ? (message.status === 'sent' ? '已发送' : '发送中') : '已接收' }),
        ]));
      }
    }
    if (elements.inboxEvidencePanel && elements.inboxEvidenceList) {
      const evidence = selected?.evidenceComments || [];
      elements.inboxEvidencePanel.hidden = !selected || evidence.length === 0;
      elements.inboxEvidenceList.replaceChildren();
      for (const comment of evidence) {
        elements.inboxEvidenceList.append(el('article', { className: 'inbox-evidence-item' }, [
          el('span', { text: comment.text || '[贴纸评论]' }),
          el('small', { text: `${formatTime(comment.createdAt)} · ${comment.replied ? '已回复' : '未回复'}` }),
        ]));
      }
    }
    const canSend = Boolean(selected?.uid && selected?.accountId);
    if (elements.inboxComposeText) {
      elements.inboxComposeText.disabled = !canSend;
      elements.inboxComposeText.placeholder = canSend ? `给 ${selected.nickname || `用户 ${shortId(selected.uid)}`} 发一条私信…` : '选择一个会话后发送私信…';
    }
    if (elements.inboxSendButton) elements.inboxSendButton.disabled = !canSend;
  }

  async function sendInboxMessage(event) {
    event?.preventDefault();
    const conversations = state.inbox.conversations || [];
    const selected = conversations.find(item => `${item.accountId}::${item.conversationId}` === state.selectedConversationId);
    const text = elements.inboxComposeText?.value.trim() || '';
    if (!selected || !text) {
      setMessage(elements.inboxComposeMessage, selected ? '请输入私信内容' : '请先选择一个私信会话', 'error');
      return;
    }
    elements.inboxSendButton.disabled = true;
    setMessage(elements.inboxComposeMessage, '正在发送真实抖音私信…');
    try {
      const payload = await api('/api/app/inbox/send', {
        method: 'POST',
        body: JSON.stringify({
          account_id: selected.accountId,
          conversation_id: selected.conversationId,
          peer_uid: selected.uid,
          peer_nickname: selected.nickname,
          text,
        }),
      });
      await waitForJob(payload.job, job => setMessage(elements.inboxComposeMessage, `${job.message} · ${job.progress}%`));
      elements.inboxComposeText.value = '';
      setMessage(elements.inboxComposeMessage, '私信已发送');
      await loadInbox(elements.inboxAccountFilter?.value || '');
    } catch (error) {
      setMessage(elements.inboxComposeMessage, error.message || '私信发送失败', 'error');
    } finally {
      renderInbox();
    }
  }

  // ── 视图切换 ──

  function switchView(view) {
    const views = {
      campaign: [elements.campaignView, elements.campaignTab, '智能找客'],
      manual: [elements.manualView, elements.manualTab, '线索审核'],
      automation: [elements.automationView, elements.automationTab, '自动化工作流'],
      accounts: [elements.accountsView, elements.accountsTab, '账号池'],
      inbox: [elements.inboxView, elements.inboxTab, '消息聚合'],
    };
    for (const [key, [viewNode, tabNode]] of Object.entries(views)) {
      if (viewNode) viewNode.hidden = key !== view;
      if (tabNode) {
        tabNode.classList.toggle('is-active', key === view);
        tabNode.setAttribute('aria-selected', String(key === view));
      }
    }
    if (elements.currentViewLabel) {
      elements.currentViewLabel.textContent = views[view]?.[2] || '智能找客';
    }
    if (view === 'automation') {
      loadAccounts(true);
      loadWorkflows();
    } else if (view === 'accounts') {
      loadAccounts(true);
    } else if (view === 'inbox') {
      loadInbox();
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
    const sampledVideoAudit = result?.sampledVideoAudit || [];

    elements.campaignStats.textContent = result
      ? `候选 ${result.candidatePoolSize ?? result.videoCount}　抽样过线 ${result.qualityPassedVideoCount ?? result.videoCount}　最终入选 ${result.videoCount}　高意向评论 ${result.filterStats?.qualified ?? 0}　客户 ${result.leadStats?.unique ?? result.filterStats?.uniqueLeads ?? 0}　草稿 ${result.draftStats?.saved || 0}　回复 ${result.replyStats?.succeeded || 0}　私信 ${result.dmStats?.succeeded || 0}`
      : '';

    elements.keywordBlock.hidden = !(result?.keywords?.length > 0);
    elements.keywordChips.replaceChildren();
    for (const keyword of result?.searchedKeywords || result?.keywords || []) {
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
        el('div', { className: 'empty-state', text: '还没有执行结果。填写参数后开始找客。' }),
      );
      return;
    }

    const createAuditCard = item => el('article', { className: 'campaign-audit-card' }, [
      el('a', {
        className: 'campaign-audit-title',
        href: `https://www.douyin.com/video/${encodeURIComponent(item.awemeId)}`,
        target: '_blank',
        rel: 'noopener noreferrer',
        text: item.title || `视频 ${shortId(item.awemeId)}`,
      }),
      el('p', {
        className: 'campaign-audit-meta',
        text: `评论 ${formatNumber(item.commentCount || 0)} · 抽样 ${item.sampleCommentCount || 0} 条 · 时间范围内 ${item.sampleRecentCount || 0} 条 · 明确线索 ${item.sampleClueHits || 0} · ${item.qualityPassed ? '抽样过线' : '未过抽样门槛'}`,
      }),
      el('p', { className: 'campaign-audit-reason', text: item.filterReason || '未通过质量筛选' }),
    ]);

    if (videos.length === 0) {
      elements.campaignVideoList.append(
        el('div', {
          className: 'empty-state',
          text: sampledVideoAudit.length
            ? `本轮没有最终可跟进线索。已抽样 ${sampledVideoAudit.length} 个视频，其中 ${sampledVideoAudit.filter(item => item.sampleRecentCount > 0).length} 个有时间范围内的评论；下方可查看逐条筛选原因。`
            : '本轮没有最终可跟进线索。可调整关键词或评论时间范围后重试。',
        }),
      );
      if (sampledVideoAudit.length > 0) {
        elements.campaignVideoList.append(
          el('details', { className: 'campaign-audit-panel', open: '' }, [
            el('summary', { text: '查看抽样视频与最终筛选原因' }),
            el('div', { className: 'campaign-audit-list' }, sampledVideoAudit.map(createAuditCard)),
          ]),
        );
      }
      return;
    }

    for (const video of videos) {
      const replies = video.replies || [];
      const succeeded = replies.filter(r => r.status === 'replied').length;
      const drafted = replies.filter(r => r.status === 'drafted').length;
      const failed = replies.filter(r => r.status === 'failed').length;
      const skipped = replies.filter(r => r.status === 'skipped').length;

      const card = el('article', { className: 'campaign-video-card' }, [
        el('div', { className: 'campaign-video-head' }, [
          el('div', { className: 'campaign-video-title-wrap' }, [
            el('h3', { className: 'campaign-video-title', text: video.title || `视频 ${shortId(video.awemeId)}` }),
            el('p', {
              className: 'campaign-video-meta',
              text: `aweme ${shortId(video.awemeId)} / 作者 ${video.authorNickname || '未知作者'}`,
            }),
          ]),
          el('div', { className: 'campaign-video-stats' }, [
            el('span', { className: 'stat-quality', text: `质量 ${Math.round(Number(video.qualityScore || 0))} 分` }),
            el('span', { text: `视频评论 ${formatNumber(video.stats?.commentCount || 0)}` }),
            el('span', { text: `近期样本 ${video.sampleRecentCount || 0}` }),
            el('span', { className: video.sampleClueHits > 0 ? 'stat-ok' : 'stat-warn', text: `需求线索 ${video.sampleClueHits || 0}` }),
            el('span', { className: video.titleRelevanceScore > 0 ? 'stat-ok' : 'stat-warn', text: `标题相关 ${Math.round(Number(video.titleRelevanceScore || 0))}` }),
            el('span', { text: `高意向 ${video.qualifiedCommentCount ?? video.commentCount ?? 0}` }),
            el('span', { className: succeeded > 0 ? 'stat-ok' : '', text: `成功 ${succeeded}` }),
            el('span', { className: drafted > 0 ? 'stat-ok' : '', text: `草稿 ${drafted}` }),
            el('span', { className: failed > 0 ? 'stat-err' : '', text: `失败 ${failed}` }),
            el('span', { className: skipped > 0 ? 'stat-warn' : '', text: `跳过 ${skipped}` }),
          ]),
        ]),
      ]);

      if (video.qualityReason) {
        card.append(el('p', { className: 'video-quality-reason', text: `入选依据：${video.qualityReason}` }));
      }

      if (video.fetchError) {
        card.append(el('p', { className: 'video-error', text: `候选评论抓取失败：${video.fetchError}` }));
      }

      for (const comment of video.comments || []) {
        const reply = replies.find(item => item.cid === comment.cid);
        card.append(el('div', { className: 'campaign-comment-row' }, [
          el('div', { className: 'campaign-comment-text' }, [
            el('span', { className: 'comment-user-name', text: comment.user?.nickname || '用户' }),
            el('span', { className: 'campaign-comment-body', text: comment.text || '[贴纸/无文字评论]' }),
            Number.isFinite(Number(comment.intentScore))
              ? el('span', { className: 'campaign-intent-score', text: `${comment.intentLabel || '意向'} ${comment.intentScore} 分` })
              : comment.needsReview
                ? el('span', { className: 'campaign-intent-score', text: '待人工复核' })
                : null,
            comment.matchedKeywords?.length
              ? el('span', { className: 'campaign-match-keywords', text: `命中：${comment.matchedKeywords.join('、')}` })
              : comment.leadSignal?.matched?.length
                ? el('span', { className: 'campaign-match-keywords', text: `信号：${comment.leadSignal.matched.slice(0, 3).join('、')}` })
              : null,
          ]),
            reply
            ? el('span', {
              className: `reply-chip ${reply.status}`,
              text: reply.status === 'replied' ? '已回复'
                : reply.status === 'drafted' ? '待审核草稿'
                  : reply.status === 'failed' ? '回复失败'
                    : `跳过 · ${reply.message || ''}`,
            })
            : comment.leadDuplicate
              ? el('span', { className: 'reply-chip skipped', text: '同一客户重复线索，已合并' })
              : comment.repliedUser
              ? el('span', { className: 'reply-chip skipped', text: '已回复用户，跳过' })
              : comment.replied
                ? el('span', { className: 'reply-chip skipped', text: '评论已回复，跳过' })
                : el('span', { className: 'reply-chip none', text: '未回复' }),
        ]));
      }

      elements.campaignVideoList.append(card);
    }

    const rejectedSamples = sampledVideoAudit.filter(item => !item.selected);
    if (rejectedSamples.length > 0) {
      elements.campaignVideoList.append(
        el('details', { className: 'campaign-audit-panel' }, [
          el('summary', { text: `本轮另有 ${rejectedSamples.length} 个抽样视频未入选 · 查看原因` }),
          el('div', { className: 'campaign-audit-list' }, rejectedSamples.map(createAuditCard)),
        ]),
      );
    }
  }

  async function startCampaign(event) {
    event.preventDefault();
    if (!state.connected) {
      setMessage(elements.campaignMessage, state.bridgeConnected
        ? '抖音桥接已连接，但账号尚未登录或登录已失效。请先在抖音网页完成登录。'
        : '抖音未连接，无法启动：请先打开 www.douyin.com 主站并刷新页面。', 'error');
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
    const intentThreshold = Number(elements.campaignIntentThreshold.value);
    const replyText = elements.campaignReplyText.value.trim();
    if (!Number.isInteger(videoCount) || videoCount < 1 || videoCount > 20) {
      setMessage(elements.campaignMessage, '候选视频数必须是 1-20 的整数', 'error');
      return;
    }
    if (!Number.isInteger(commentsPerVideo) || commentsPerVideo < 0 || commentsPerVideo > 100) {
      setMessage(elements.campaignMessage, '每个视频评论数必须是 0-100 的整数', 'error');
      return;
    }
    if (!Number.isInteger(intentThreshold) || intentThreshold < 0 || intentThreshold > 100) {
      setMessage(elements.campaignMessage, '最低意向分必须是 0-100 的整数', 'error');
      return;
    }

    elements.campaignRunButton.disabled = true;
    elements.campaignProgress.hidden = false;
    setProgressBar(0);
    setMessage(elements.campaignMessage, '正在提交后台任务…');

    try {
      const payload = await api('/api/app/campaign/run', {
        method: 'POST',
        body: JSON.stringify({
          keyword,
          manualKeywords: elements.campaignManualKeywords.value,
          commentKeywords: elements.campaignCommentKeywords.value,
          videoCount,
          commentsPerVideo,
          videoTimeRangeDays: Number(elements.campaignVideoTimeRange.value),
          commentTimeRangeDays: Number(elements.campaignCommentTimeRange.value),
          keywordExpandEnabled: elements.campaignExpandEnabled.checked,
          keywordExpandCount: expandCount,
          aiFilterEnabled: elements.campaignAiFilterEnabled.checked,
          intentThreshold,
          replyText,
          deliveryMode: elements.campaignDeliveryMode.value,
          minVideoComments: Number(state.settings?.minVideoComments ?? 20),
          sampleCommentsPerVideo: Number(state.settings?.sampleCommentsPerVideo ?? 20),
          minVideoLeadClues: Number(state.settings?.minVideoLeadClues ?? 1),
        }),
      });
      state.jobs = [payload.job, ...state.jobs.filter(job => job.id !== payload.job.id)];
      renderTaskCenter();
      setProgressBar(payload.job.progress || 0);
      setMessage(elements.campaignMessage, '任务已进入后台，可继续修改参数并启动下一个任务；点击“任务中心”查看准确进度。');
      elements.campaignProgress.hidden = true;
      openTaskCenter();
      loadJobs();
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
    elements.videoTimeRange.value = String(settings.videoTimeRangeDays ?? 30);
    elements.intentThreshold.value = String(settings.intentThreshold ?? 65);
    elements.intentAnalysisMode.value = settings.intentAnalysisMode || 'text-only';
    elements.replyTone.value = settings.replyTone || '自然、真诚、简洁';
    elements.replyCta.value = settings.replyCta || '';
    elements.aiIntentEnabled.checked = settings.aiIntentEnabled !== false;
    elements.keywordExpandEnabled.checked = settings.keywordExpandEnabled !== false;
    elements.keywordExpandCount.value = String(settings.keywordExpandCount ?? 10);
    elements.minVideoComments.value = String(settings.minVideoComments ?? 20);
    elements.sampleCommentsPerVideo.value = String(settings.sampleCommentsPerVideo ?? 20);
    elements.minVideoLeadClues.value = String(settings.minVideoLeadClues ?? 1);
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
      elements.campaignVideoTimeRange.value = String(settings.videoTimeRangeDays ?? 30);
      elements.campaignCommentTimeRange.value = String(settings.commentTimeRangeDays ?? 2);
      elements.campaignExpandEnabled.checked = settings.keywordExpandEnabled !== false;
      elements.campaignExpandCount.value = String(settings.keywordExpandCount ?? 10);
      elements.campaignAiFilterEnabled.checked = settings.aiIntentEnabled !== false;
      elements.campaignIntentThreshold.value = String(settings.intentThreshold ?? 65);
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
      videoTimeRangeDays: Number(elements.videoTimeRange.value),
      intentThreshold: Number(elements.intentThreshold.value),
      intentAnalysisMode: elements.intentAnalysisMode.value,
      replyTone: elements.replyTone.value.trim(),
      replyCta: elements.replyCta.value.trim(),
      aiIntentEnabled: elements.aiIntentEnabled.checked,
      keywordExpandEnabled: elements.keywordExpandEnabled.checked,
      keywordExpandCount: Number(elements.keywordExpandCount.value),
      minVideoComments: Number(elements.minVideoComments.value),
      sampleCommentsPerVideo: Number(elements.sampleCommentsPerVideo.value),
      minVideoLeadClues: Number(elements.minVideoLeadClues.value),
      defaultReplyText: elements.defaultReplyText.value.trim(),
    };
  }

  async function loadSettings() {
    const payload = await api('/api/app/settings');
    applySettings(payload.settings);
  }

  function populateModelOptions(models = [], selected = '') {
    const values = [...new Set([selected, ...models].map(value => String(value || '').trim()).filter(Boolean))];
    elements.llmModelOptions.replaceChildren();
    for (const value of values) elements.llmModelOptions.append(el('option', { value }));
    if (selected) elements.llmModel.value = selected;
  }

  function selectedLlmMode() {
    return elements.llmModeManaged.checked ? 'managed' : 'custom';
  }

  function updateLlmModeUI() {
    const managed = selectedLlmMode() === 'managed';
    elements.customApiFields.hidden = managed;
    elements.managedServiceFields.hidden = !managed;
    elements.fetchModelsButton.disabled = managed;
  }

  function updateTutorialStatus() {
    const modelReady = state.llmConfig?.mode === 'managed'
      ? state.llmConfig?.managedAvailable
      : state.llmConfig?.apiKeyConfigured;
    if (elements.tutorialModelStatus) {
      elements.tutorialModelStatus.classList.toggle('is-ok', Boolean(modelReady));
      elements.tutorialModelStatus.querySelector('b').textContent = modelReady ? '已配置' : '待配置';
    }
    if (elements.tutorialBridgeStatus) {
      elements.tutorialBridgeStatus.classList.toggle('is-ok', state.connected);
      elements.tutorialBridgeStatus.querySelector('b').textContent = state.connected ? '已连接' : '待连接';
    }
  }

  function applyLlmConfig(config) {
    state.llmConfig = config;
    const managed = config.mode === 'managed' && config.managedAvailable;
    elements.llmModeManaged.disabled = !config.managedAvailable;
    elements.managedModeCard.classList.toggle('is-unavailable', !config.managedAvailable);
    elements.managedModeHint.textContent = config.managedAvailable
      ? `${config.managedLabel || '平台服务'} · 无需自行填写 API Key`
      : '即将开放，无需自行准备 API Key';
    elements.llmModeManaged.checked = managed;
    elements.llmModeCustom.checked = !managed;
    elements.llmBaseUrl.value = config.baseUrl || 'https://api.openai.com/v1';
    elements.llmApiKey.value = '';
    elements.llmApiKey.placeholder = config.apiKeyConfigured
      ? `已配置 ${config.apiKeyMasked || 'API Key'}，留空保持不变`
      : '请输入 API Key';
    elements.llmKeyHint.textContent = config.source === 'environment'
      ? '当前由环境变量控制，前端不能覆盖。'
      : '密钥仅保存在本机 config.json，不会返回给浏览器。';
    populateModelOptions(state.llmModels, config.model || '');
    elements.llmConfigBadge.textContent = managed
      ? '平台服务'
      : config.apiKeyConfigured ? '自备 API 已配置' : '尚未配置';
    elements.llmConfigBadge.className = `status-badge ${(managed || config.apiKeyConfigured) ? 'status-ok' : 'status-muted'}`;
    updateLlmModeUI();
    updateTutorialStatus();
  }

  function readLlmForm() {
    return {
      mode: selectedLlmMode(),
      baseUrl: elements.llmBaseUrl.value.trim(),
      apiKey: elements.llmApiKey.value.trim(),
      model: elements.llmModel.value,
    };
  }

  async function loadLlmConfig() {
    const payload = await api('/api/app/llm/config');
    applyLlmConfig(payload.config);
  }

  async function fetchLlmModels() {
    elements.fetchModelsButton.disabled = true;
    setMessage(elements.llmTestMessage, '正在读取模型列表…');
    try {
      const payload = await api('/api/app/llm/models', {
        method: 'POST',
        body: JSON.stringify(readLlmForm()),
      });
      state.llmModels = payload.models || [];
      const current = elements.llmModel.value;
      populateModelOptions(state.llmModels, state.llmModels.includes(current) ? current : state.llmModels[0]);
      setMessage(elements.llmTestMessage, `已获取 ${state.llmModels.length} 个模型`);
    } catch (error) {
      setMessage(elements.llmTestMessage, error.message, 'error');
    } finally {
      elements.fetchModelsButton.disabled = selectedLlmMode() === 'managed';
    }
  }

  async function testLlmConnection() {
    elements.testLlmButton.disabled = true;
    setMessage(elements.llmTestMessage, '正在调用模型测试，请稍候…');
    try {
      const payload = await api('/api/app/llm/test', {
        method: 'POST',
        body: JSON.stringify({ ...readLlmForm(), apply: true }),
      });
      if (payload.config) applyLlmConfig(payload.config);
      setMessage(elements.llmTestMessage, `连接成功并已应用 · ${payload.model} · ${payload.latencyMs}ms · 发送“${payload.request || 'hi'}” · 模型回复：“${payload.reply || '[空回复]'}”`);
    } catch (error) {
      setMessage(elements.llmTestMessage, error.message, 'error');
    } finally {
      elements.testLlmButton.disabled = false;
    }
  }

  function openSettings() {
    if (state.savedSettings) applySettings(state.savedSettings);
    if (state.llmConfig) applyLlmConfig(state.llmConfig);
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

  function openTutorial() {
    updateTutorialStatus();
    if (typeof elements.tutorialDialog.showModal === 'function') {
      if (!elements.tutorialDialog.open) elements.tutorialDialog.showModal();
    } else {
      elements.tutorialDialog.setAttribute('open', '');
    }
  }

  function closeTutorial(markSeen = false) {
    if (markSeen) localStorage.setItem('comment-console:tutorial-seen', '1');
    if (typeof elements.tutorialDialog.close === 'function') {
      elements.tutorialDialog.close();
    } else {
      elements.tutorialDialog.removeAttribute('open');
    }
  }

  function configureModelFromTutorial() {
    closeTutorial();
    openSettings();
    setTimeout(() => elements.llmBaseUrl.focus(), 50);
  }

  async function saveSettings(event) {
    event.preventDefault();
    setMessage(elements.settingsMessage, '正在保存…');
    try {
      const llmPayload = state.llmConfig?.source === 'environment'
        ? { config: state.llmConfig }
        : await api('/api/app/llm/config', {
          method: 'POST',
          body: JSON.stringify(readLlmForm()),
        });
      const payload = await api('/api/app/settings', {
        method: 'POST',
        body: JSON.stringify(readSettingsForm()),
      });
      applyLlmConfig(llmPayload.config);
      applySettings(payload.settings);
      setMessage(elements.settingsMessage, '模型与工作台设置已保存');
      setTimeout(closeSettings, 350);
    } catch (error) {
      setMessage(elements.settingsMessage, error.message, 'error');
    }
  }

  // ── 连接状态 ──

  function renderConnectionBadge() {
    if (!state.bridgeConnected) {
      elements.connectionBadge.textContent = '等待抖音连接';
      elements.connectionBadge.className = 'status-badge status-muted';
    } else if (state.douyinAuthenticated === false) {
      elements.connectionBadge.textContent = '抖音已连接 · 请先登录';
      elements.connectionBadge.className = 'status-badge status-error';
    } else if (state.douyinAuthenticated === true) {
      elements.connectionBadge.textContent = `抖音已登录 · ${state.connectionCount}`;
      elements.connectionBadge.className = 'status-badge status-ok';
    } else {
      elements.connectionBadge.textContent = '抖音已连接 · 正在验证登录';
      elements.connectionBadge.className = 'status-badge status-muted';
    }
  }

  async function checkDouyinSession(force = false) {
    if (!state.bridgeConnected || state.douyinSessionLoading) return;
    if (!force && Date.now() - state.douyinSessionCheckedAt < 15000) return;
    state.douyinSessionLoading = true;
    try {
      const payload = await api('/api/app/douyin/session');
      state.douyinAuthenticated = payload.session?.authenticated === true;
      state.douyinSessionCheckedAt = Date.now();
    } catch (_) {
      state.douyinAuthenticated = null;
      state.douyinSessionCheckedAt = Date.now();
    } finally {
      state.douyinSessionLoading = false;
      state.connected = state.bridgeConnected && state.douyinAuthenticated !== false;
      renderConnectionBadge();
      updateConnectionUI();
    }
  }

  function updateConnectionUI() {
    const connectionKey = `${state.bridgeConnected}:${state.douyinAuthenticated}`;
    const changed = state.lastConnected !== connectionKey;
    state.lastConnected = connectionKey;
    const hint = !state.bridgeConnected
      ? '抖音未连接：请先在浏览器打开 www.douyin.com 主站并刷新页面。'
      : state.douyinAuthenticated === false
        ? '本地桥接已经连接，但抖音账号没有登录或登录已失效。请在抖音网页完成登录后再试。'
        : '';
    elements.campaignRunButton.disabled = !state.connected;
    elements.campaignRunButton.title = state.connected ? '' : state.bridgeConnected ? '请先登录抖音账号' : '抖音未连接，无法启动';
    elements.discoverButton.disabled = !state.connected;
    elements.discoverButton.title = state.connected ? '' : state.bridgeConnected ? '请先登录抖音账号' : '抖音未连接，无法筛选';
    if (elements.analyzeCommentsButton) {
      elements.analyzeCommentsButton.disabled = !state.connected || !state.selectedAwemeId || state.settings?.aiIntentEnabled === false;
      elements.analyzeCommentsButton.title = !state.connected
        ? '抖音未连接，无法分析'
        : !state.selectedAwemeId ? '请先选择视频'
          : state.settings?.aiIntentEnabled === false ? '设置中已关闭 AI 意向判定' : '';
    }
    updateTutorialStatus();
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
      const wasBridgeConnected = state.bridgeConnected;
      state.bridgeConnected = count > 0;
      state.connectionCount = count;
      if (!state.bridgeConnected || !wasBridgeConnected) {
        state.douyinAuthenticated = null;
        state.douyinSessionCheckedAt = 0;
      }
      state.connected = state.bridgeConnected && state.douyinAuthenticated !== false;
      renderConnectionBadge();
      updateConnectionUI();
      if (state.bridgeConnected) await checkDouyinSession();
    } catch (_) {
      state.bridgeConnected = false;
      state.connectionCount = 0;
      state.douyinAuthenticated = null;
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
      } else if (elements.intentFilter.value === 'drafts') {
        params.set('has_draft', 'true');
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
      let consecutiveErrors = 0;

      async function tick() {
        let latest;
        try {
          const payload = await api(`/api/app/jobs/${encodeURIComponent(job.id)}`);
          latest = payload.job;
          consecutiveErrors = 0;
        } catch (error) {
          consecutiveErrors += 1;
          if (/Job not found/i.test(error.message) || consecutiveErrors >= 10) {
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
        setTimeout(tick, 800);
      }

      tick();
    });
  }

  async function startDiscover(event) {
    event.preventDefault();
    if (!state.connected) {
      setMessage(elements.discoverMessage, state.bridgeConnected
        ? '抖音桥接已连接，但账号尚未登录或登录已失效。请先在抖音网页完成登录。'
        : '抖音未连接，无法筛选：请先打开 www.douyin.com 主站并刷新页面。', 'error');
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
  elements.automationTab?.addEventListener('click', () => switchView('automation'));
  elements.accountsTab?.addEventListener('click', () => switchView('accounts'));
  elements.inboxTab?.addEventListener('click', () => switchView('inbox'));
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
  elements.tutorialButton.addEventListener('click', openTutorial);
  elements.taskCenterButton.addEventListener('click', openTaskCenter);
  elements.closeTaskCenterButton.addEventListener('click', closeTaskCenter);
  elements.dismissTaskCenterButton.addEventListener('click', closeTaskCenter);
  elements.refreshTasksButton.addEventListener('click', loadJobs);
  elements.closeSettingsButton.addEventListener('click', closeSettings);
  elements.cancelSettingsButton.addEventListener('click', closeSettings);
  elements.settingsForm.addEventListener('submit', saveSettings);
  elements.llmModeCustom.addEventListener('change', updateLlmModeUI);
  elements.llmModeManaged.addEventListener('change', updateLlmModeUI);
  elements.fetchModelsButton.addEventListener('click', fetchLlmModels);
  elements.testLlmButton.addEventListener('click', testLlmConnection);
  elements.toggleApiKeyButton.addEventListener('click', () => {
    const showing = elements.llmApiKey.type === 'text';
    elements.llmApiKey.type = showing ? 'password' : 'text';
    elements.toggleApiKeyButton.textContent = showing ? '显示' : '隐藏';
  });
  elements.closeTutorialButton.addEventListener('click', () => closeTutorial());
  elements.finishTutorialButton.addEventListener('click', () => closeTutorial(true));
  elements.tutorialConfigureModel.addEventListener('click', configureModelFromTutorial);
  elements.newWorkflowButton?.addEventListener('click', resetWorkflowEditor);
  elements.workflowForm?.addEventListener('submit', saveWorkflow);
  elements.deleteWorkflowButton?.addEventListener('click', deleteWorkflow);
  elements.refreshAccountsButton?.addEventListener('click', () => loadAccounts(true));
  elements.refreshAccountsPageButton?.addEventListener('click', () => loadAccounts(true));
  elements.refreshInboxButton?.addEventListener('click', () => loadInbox());
  elements.newInboxButton?.addEventListener('click', () => {
    if (!elements.inboxNewConversationForm) return;
    const opening = elements.inboxNewConversationForm.hidden;
    elements.inboxNewConversationForm.hidden = !opening;
    if (opening) elements.inboxNewPeerUid?.focus();
  });
  elements.inboxAccountFilter?.addEventListener('change', () => loadInbox(elements.inboxAccountFilter.value));
  elements.inboxNewConversationForm?.addEventListener('submit', startNewInboxConversation);
  elements.inboxComposeForm?.addEventListener('submit', sendInboxMessage);

  renderCampaignResult();
  setInterval(checkConnection, 3000);
  setInterval(loadJobs, 1500);
  setInterval(() => {
    if (!elements.accountsView?.hidden || !elements.automationView?.hidden) loadAccounts(false);
  }, 8000);
  setInterval(() => {
    if (!elements.inboxView?.hidden) loadInbox();
  }, 15000);
  Promise.all([loadSettings(), loadLlmConfig(), checkConnection(), loadVideos(), loadOverview(), loadJobs(), loadAccounts(true), loadWorkflows()]).then(() => {
    updateConnectionUI();
    if (localStorage.getItem('comment-console:tutorial-seen') !== '1') openTutorial();
  }).catch(error => {
    setMessage(elements.campaignMessage, error.message, 'error');
    checkConnection();
  });
})();

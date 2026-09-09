(() => {
  'use strict';

  const form = document.querySelector('#settingsForm');
  const timeRange = document.querySelector('#timeRange');
  const maxComments = document.querySelector('#maxComments');
  const aiIntentEnabled = document.querySelector('#aiIntentEnabled');
  const targetCustomer = document.querySelector('#targetCustomer');
  const saveMessage = document.querySelector('#saveMessage');
  const cancelButton = document.querySelector('#cancelButton');
  const connectionBadge = document.querySelector('#connectionBadge');
  let savedSettings = null;

  function setMessage(text, isError = false) {
    saveMessage.textContent = text;
    saveMessage.classList.toggle('error', isError);
  }

  function applySettings(settings) {
    timeRange.value = String(settings.commentTimeRangeDays ?? 2);
    maxComments.value = String(settings.maxCommentsPerVideo ?? 0);
    aiIntentEnabled.checked = settings.aiIntentEnabled !== false;
    targetCustomer.value = settings.targetCustomer || '';
    savedSettings = { ...settings };
  }

  function readForm() {
    return {
      commentTimeRangeDays: Number(timeRange.value),
      maxCommentsPerVideo: Number(maxComments.value),
      aiIntentEnabled: aiIntentEnabled.checked,
      targetCustomer: targetCustomer.value.trim(),
    };
  }

  async function loadSettings() {
    const response = await fetch('/api/app/settings', { headers: { Accept: 'application/json' } });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error || '读取设置失败');
    applySettings(payload.settings);
  }

  async function checkConnection() {
    try {
      const response = await fetch('/api/status', { headers: { Accept: 'application/json' } });
      const payload = await response.json();
      if (payload.ok) {
        const count = Number(payload.totalConnections || 0);
        connectionBadge.textContent = count > 0 ? `抖音已连接 · ${count}` : '等待抖音连接';
        connectionBadge.className = `status-badge ${count > 0 ? 'status-ok' : 'status-muted'}`;
      } else throw new Error('status failed');
    } catch (_) {
      connectionBadge.textContent = 'Bridge 未连接';
      connectionBadge.className = 'status-badge status-error';
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setMessage('正在保存…');
    try {
      const response = await fetch('/api/app/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(readForm()),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || '保存失败');
      applySettings(payload.settings);
      setMessage('设置已保存，对本次及后续抓取生效。');
    } catch (error) {
      setMessage(error.message || '保存失败', true);
    }
  });

  cancelButton.addEventListener('click', () => {
    if (savedSettings) applySettings(savedSettings);
    setMessage('已恢复上次保存的设置。');
  });

  loadSettings().catch((error) => setMessage(error.message || '读取设置失败', true));
  checkConnection();
})();

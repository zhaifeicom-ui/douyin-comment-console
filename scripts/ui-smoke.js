// UI smoke check: renders the app, verifies the campaign/manual tabs and
// captures desktop + mobile screenshots for layout review.
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const BASE = 'http://127.0.0.1:19422/app';
const OUT = path.join(__dirname, '..', 'artifacts');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

function checks(page) {
  return page.evaluate(() => {
    const vis = el => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
    };
    return {
      campaignTab: vis(document.getElementById('campaignTab')),
      manualTab: vis(document.getElementById('manualTab')),
      manualView: vis(document.getElementById('manualView')),
      campaignView: vis(document.getElementById('campaignView')),
      campaignKeyword: vis(document.getElementById('campaignKeyword')),
      campaignReplyText: vis(document.getElementById('campaignReplyText')),
      campaignSubmit: vis(document.getElementById('campaignRunButton')),
      campaignButtonDisabled: document.getElementById('campaignRunButton').disabled,
      discoverButtonDisabled: document.getElementById('discoverButton').disabled,
      connectionHintVisible: vis(document.getElementById('connectionHint')),
      discoverHintVisible: vis(document.getElementById('discoverHint')),
      badgeText: document.getElementById('connectionBadge').textContent.trim(),
      settingsDialogHidden: !vis(document.getElementById('settingsDialog')),
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      buttonText: document.getElementById('campaignRunButton')?.textContent.trim() || '',
      btnRect: (() => {
        const b = document.getElementById('campaignRunButton');
        const r = b.getBoundingClientRect();
        return { w: r.width, h: r.height, scrollW: b.scrollWidth, scrollH: b.scrollHeight };
      })(),
    };
  });
}

async function tabSwitchCheck(page) {
  await page.click('#manualTab');
  await page.waitForTimeout(150);
  const manual = await page.evaluate(() => {
    const vis = el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== 'none';
    };
    return {
      manualView: vis(document.getElementById('manualView')),
      campaignView: vis(document.getElementById('campaignView')),
      manualActive: document.getElementById('manualTab').classList.contains('is-active'),
    };
  });
  await page.click('#campaignTab');
  await page.waitForTimeout(150);
  return manual;
}

async function layoutCheck(page) {
  return page.evaluate(() => {
    const overlap = (a, b) => !(
      a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top
    );
    const panel = document.querySelector('.campaign-panel').getBoundingClientRect();
    const results = document.querySelector('.campaign-results-panel').getBoundingClientRect();
    const btn = document.getElementById('campaignRunButton').getBoundingClientRect();
    const form = document.getElementById('campaignForm').getBoundingClientRect();
    return {
      panelResultsOverlap: overlap(panel, results),
      btnInsideForm: btn.left >= form.left && btn.right <= form.right && btn.top >= form.top && btn.bottom <= form.bottom,
      progressHidden: !(document.getElementById('campaignProgress').offsetParent !== null),
    };
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: fs.existsSync(EDGE) ? EDGE : undefined,
    channel: fs.existsSync(EDGE) ? undefined : 'msedge',
    headless: true,
  });

  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await desktop.goto(BASE, { waitUntil: 'networkidle' });
  const dChecks = await checks(desktop);
  const dTabs = await tabSwitchCheck(desktop);
  const dLayout = await layoutCheck(desktop);
  await desktop.screenshot({ path: path.join(OUT, 'ui-desktop.png'), fullPage: true });

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto(BASE, { waitUntil: 'networkidle' });
  const mChecks = await checks(mobile);
  const mTabs = await tabSwitchCheck(mobile);
  const mLayout = await layoutCheck(mobile);
  await mobile.screenshot({ path: path.join(OUT, 'ui-mobile.png'), fullPage: true });

  console.log('desktop:', JSON.stringify(dChecks));
  console.log('mobile:', JSON.stringify(mChecks));
  console.log('tabSwitch desktop:', JSON.stringify(dTabs));
  console.log('tabSwitch mobile:', JSON.stringify(mTabs));
  console.log('layout desktop:', JSON.stringify(dLayout));
  console.log('layout mobile:', JSON.stringify(mLayout));
  await browser.close();
})().catch(err => { console.error('UI_SMOKE_FAIL', err.message); process.exit(1); });

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.REDDIT_TOOLBOX_PLAYWRIGHT_MODULE || 'playwright');
const script = fs.readFileSync(path.resolve(__dirname, '../userscripts/reddit-toolbox.user.js'), 'utf8');
const output = process.env.REDDIT_TOOLBOX_BROWSER_OUTPUT || path.resolve(__dirname, '../artifacts/browser');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const requests = [];
    await context.route('**/*', route => {
      const request = route.request(), url = new URL(request.url());
      assert.equal(url.origin, 'https://www.reddit.com');
      if (request.isNavigationRequest()) return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Synthetic pacing fixture</title><body><h1>Isolated pacing check</h1></body>' });
      requests.push({ at: Date.now(), method: request.method(), path: url.pathname });
      assert.equal(request.method(), 'GET');
      const payload = url.pathname === '/api/me.json' ? { data: { name: 'fixture', modhash: 'fixture-only' } } : { data: { children: [], after: null } };
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(payload) });
    });
    // Deliberately retain obsolete fast settings. Do not patch clocks or the script.
    await context.addInitScript({ content: `globalThis.GM_getValue=(key,fallback)=>{const saved=localStorage.getItem(key);return saved?JSON.parse(saved):key.endsWith(':settings')?{...fallback,minimumDelaySeconds:0,maximumDelaySeconds:0}:fallback;};globalThis.GM_setValue=(key,value)=>localStorage.setItem(key,JSON.stringify(value));globalThis.GM_deleteValue=key=>localStorage.removeItem(key);\n${script}` });
    const page = await context.newPage();
    await page.goto('https://www.reddit.com/');
    await page.locator('.launcher').click();
    assert.equal(await page.locator('#minimum-delay,#maximum-delay').count(), 0);
    await page.locator('.scan').click();
    await page.waitForFunction(() => __redditToolboxApp.busy);
    await page.waitForFunction(() => !__redditToolboxApp.busy, null, { timeout: 45_000 });
    assert.equal(requests.length, 3);
    const intervals = requests.slice(1).map((request, i) => request.at - requests[i].at);
    assert.ok(intervals.every(ms => ms >= 7_450), JSON.stringify(intervals));
    // A new tab must inherit the most recent slot through the real Web Lock/store.
    const second = await context.newPage();
    await second.goto('https://www.reddit.com/');
    await second.locator('.launcher').click();
    await second.locator('.advanced summary').click();
    await second.locator('.check-login').click();
    await second.waitForFunction(() => !__redditToolboxApp.busy, null, { timeout: 20_000 });
    assert.equal(requests.length, 4);
    intervals.push(requests[3].at - requests[2].at);
    assert.ok(intervals.at(-1) >= 7_450, JSON.stringify(intervals));
    const result = { browser: browser.version(), generatedBytes: Buffer.byteLength(script), requests: requests.length, intervalsMs: intervals, speedControlsAbsent: true, legacySpeedIgnored: true, crossTabBudget: true, realClock: true, allTrafficSynthetic: true, mutations: 0 };
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, 'real-time-pacing.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

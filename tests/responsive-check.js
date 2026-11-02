// Responsive checklist runner for muse_pwa (see tests/responsive-checklist.md).
// Run:  node tests/responsive-check.js
// Env:  APP_URL (default http://127.0.0.1:8000/)
//       PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH (optional, for a local chrome-headless-shell)
// Requires Playwright: npm i -D playwright
// Layout checks are SKIPPED, not failed, when Bulma did not load — a
// Bulma-less page is unstyled, so its geometry says nothing about the app.
// (Known case: the Muse cloud sandbox, where the Bulma CDN is unreachable.)
const { chromium } = require('playwright');

const APP_URL = process.env.APP_URL || 'http://127.0.0.1:8000/';
const VIEWPORTS = [
  ['small-phone-375x667', 375, 667],
  ['iphone17-393x852', 393, 852],
  ['pixel10-412x915', 412, 915],
  ['below-breakpoint-767x800', 767, 800],
  ['breakpoint-768x1024', 768, 1024],
  ['tablet-1024x768', 1024, 768],
  ['desktop-1440x900', 1440, 900],
  ['iphone17-landscape-852x393', 852, 393],
  ['pixel10-landscape-915x412', 915, 412],
];

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox'],
  });
  let pass = 0, fail = 0, skip = 0;
  const check = (name, ok) => {
    if (ok === null) { skip++; console.log(`  SKIP ${name}`); }
    else if (ok) { pass++; console.log(`  PASS ${name}`); }
    else { fail++; console.log(`  FAIL ${name}`); }
  };
  for (const [name, w, h] of VIEWPORTS) {
    console.log(`\n${name} (${w}x${h})`);
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.goto(APP_URL, { waitUntil: 'networkidle' });
    // Bulma present? .columns must be a flex row when Bulma loads.
    const bulma = await page.evaluate(() => {
      const el = document.getElementById('app-layout');
      return el && getComputedStyle(el).display === 'flex';
    });
    if (!bulma) console.log('  NOTE Bulma not loaded — layout checks skipped for this viewport');
    const info = await page.evaluate(() => {
      const c = document.getElementById('composer');
      const r = c ? c.getBoundingClientRect() : { bottom: -1 };
      const sb = document.getElementById('sidebar');
      const send = document.getElementById('send-btn');
      const sendR = send ? send.getBoundingClientRect() : { height: 0, width: 0 };
      return {
        hScroll: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
        gapBelow: Math.round(window.innerHeight - r.bottom),
        sidebarDisplay: sb ? getComputedStyle(sb).display : 'missing',
        sendH: Math.round(sendR.height), sendW: Math.round(sendR.width),
        devicePreview: document.body.innerText.includes('Device preview'),
      };
    });
    check('no horizontal scroll', info.hScroll);
    check('no Device preview button', !info.devicePreview);
    check('composer gap <= 2px', bulma ? info.gapBelow <= 2 : null);
    check('sidebar hidden at <=768, visible above', bulma ? (w <= 768 ? info.sidebarDisplay === 'none' : info.sidebarDisplay !== 'none') : null);
    check('Send target >= 44px tall on mobile', bulma && w <= 768 ? info.sendH >= 44 : (bulma ? true : null));
    // Key flow: example fills composer without sending, then Send gives 2 messages.
    await page.click('#welcome > div > button:nth-of-type(1)');
    const filled = await page.evaluate(() => document.getElementById('message-input').value.length > 0);
    const before = await page.evaluate(() => document.querySelectorAll('.message-bubble').length);
    check('example fills composer without sending', filled && before === 0);
    await page.click('#send-btn');
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => document.querySelectorAll('.message-bubble').length);
    check('Send gives user + AI messages', after === 2);
    const gapAfter = await page.evaluate(() => {
      const c = document.getElementById('composer');
      return Math.round(window.innerHeight - c.getBoundingClientRect().bottom);
    });
    check('composer pinned after send', bulma ? gapAfter <= 2 : null);
    await page.close();
  }
  await browser.close();
  console.log(`\nRESULT pass=${pass} fail=${fail} skip=${skip}`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });

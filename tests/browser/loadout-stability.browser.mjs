import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TEST_ORIGIN || 'http://localhost:3000';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const browser = await chromium.launch({ headless: true, ...(process.env.TEST_BROWSER_PATH ? { executablePath: process.env.TEST_BROWSER_PATH } : {}) });
try {
  for (const [width, height] of [[320,700],[390,740],[768,1024],[1024,768],[1440,900]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(origin);
    await page.waitForTimeout(1000);
    await page.locator('.title-start').click();
    await page.locator('.entry-confirm').click();
    await page.locator('.entry-panel .choice-row').first().locator('button').nth(1).click();
    await page.locator('.entry-confirm').click();
    for (const size of ['standard', 'xlarge']) {
      await page.locator('.shell').evaluate((el, value) => { el.classList.remove('text-size-standard', 'text-size-xlarge'); el.classList.add(`text-size-${value}`); }, size);
      if (await page.locator('.setup-confirm-actions button').last().isEnabled()) await page.locator('.setup-confirm-actions button').last().click();
      await page.waitForTimeout(200);
      const controlTop = await page.locator('.switch-setup-controls').evaluate(el => el.getBoundingClientRect().top + scrollY);
      for (const item of ['shield','booster','blast']) {
        await page.locator(`.switch-setup-controls button.${item}`).click();
        const nextTop = await page.locator('.switch-setup-controls').evaluate(el => el.getBoundingClientRect().top + scrollY);
        assert.ok(Math.abs(controlTop - nextTop) < 2, `Selection shifts controls: ${width}/${size}: ${controlTop} -> ${nextTop}`);
      }
      await page.locator('.loadout-row summary').first().click();
      const expandedTop = await page.locator('.switch-setup-controls').evaluate(el => el.getBoundingClientRect().top + scrollY);
      assert.ok(Math.abs(controlTop - expandedTop) < 2, 'Expanded detail shifts controls');
      await page.locator('.loadout-row summary').first().click();
      const confirm = page.locator('.setup-confirm-actions button').first();
      await confirm.scrollIntoViewIfNeeded();
      assert.ok(await confirm.evaluate(el => { const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.x+r.width/2,r.y+r.height/2); return el === hit || el.contains(hit); }), 'Confirm blocked');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Horizontal overflow');
      if (process.env.LAYOUT_SCREENSHOT_DIR && size === 'standard') await page.screenshot({ path: `${process.env.LAYOUT_SCREENSHOT_DIR}/loadout-${width}.png`, fullPage: true });
    }
    await page.close();
  }
  console.log('PASS: stable loadout controls at 5 widths and 2 text sizes, including expanded details');
} finally { await browser.close(); }

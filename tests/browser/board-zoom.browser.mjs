import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:3016';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const browser = await chromium.launch({ headless: true, executablePath: process.env.TEST_BROWSER_PATH });
try {
  for (const language of ['ja', 'en']) for (const width of [320, 390, 768]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, hasTouch: true });
    await page.addInitScript(value => localStorage.setItem('meteor-race-language', value), language);
    await page.goto(origin);
    await page.waitForTimeout(1200);
    await page.locator('.title-start').click();
    await page.locator('.entry-confirm').click();
    await page.locator('.event-toggle-grid button').first().click();
    await page.locator('[data-choice-group="board-size"] button[value="13"]').click();
    await page.locator('.entry-confirm').click();
    await page.locator('.board:visible').waitFor();
    const board = page.locator('.board');
    const before = await board.boundingBox();
    await page.locator('.board-zoom-toggle').tap();
    await page.waitForTimeout(100);
    const after = await board.boundingBox();
    assert.equal(Math.round(before.width), Math.round(after.width), 'Zoom preserves board slot');
    const cell = await page.locator('.cell').first().boundingBox();
    assert.ok(cell.width >= 44 && cell.height >= 44, JSON.stringify({width, cell}));
    assert.ok(await board.evaluate(el => el.scrollWidth > el.clientWidth));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await board.evaluate(el => el.scrollTo(el.scrollWidth, el.scrollHeight));
    await page.locator('.cell.legal').first().tap();
    await page.waitForTimeout(300);
    await page.locator('.board-zoom-toggle').tap();
    await page.waitForTimeout(100);
    assert.equal(await board.getAttribute('data-expanded'), 'false');
    assert.ok(await board.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    assert.equal(Math.round((await board.boundingBox()).width), Math.round(before.width));
    await page.setViewportSize({ width:1440, height:900 });
    await page.waitForTimeout(100);
    assert.equal(await page.locator('.board-zoom-toggle').isVisible(), false);
    assert.ok(await board.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    if (process.env.LAYOUT_SCREENSHOT_DIR) await page.screenshot({path:`${process.env.LAYOUT_SCREENSHOT_DIR}/board-${language}-${width}.png`});
    await page.close();
  }
  console.log('PASS board zoom: ja/en × 320/390/768; >=44px cells, fit/reset, input and desktop resize');
} finally { await browser.close(); }

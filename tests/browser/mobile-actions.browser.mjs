import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TEST_ORIGIN || 'http://localhost:3000';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const browser = await chromium.launch({ headless: true, ...(process.env.TEST_BROWSER_PATH ? { executablePath: process.env.TEST_BROWSER_PATH } : {}) });
try {
  for (const language of ['ja', 'en']) for (const width of [320, 390, 430]) {
    const page = await browser.newPage({ viewport: { width, height: 740 }, hasTouch: true });
    await page.addInitScript(value => localStorage.setItem('meteor-race-language', value), language);
    await page.goto(origin);
    await page.waitForTimeout(1000);
    await page.locator('.title-start').tap();
    await page.locator('.entry-confirm').tap();
    await page.locator('.entry-panel .choice-row').first().locator('button').nth(1).tap();
    if (width === 390) for (let i = 0; i < 2; i++) await page.locator('.cpu-stepper button').last().tap();
    await page.locator('.entry-confirm').tap();
    for (let i = 0; i < 2; i++) {
      for (const kind of ['shield', 'booster', 'blast']) await page.locator(`.switch-setup-controls button.${kind}`).tap();
      await page.locator('.setup-confirm-actions button').first().tap();
      await page.waitForTimeout(500);
    }
    await page.locator('.board:visible').waitFor();
    await page.evaluate(() => scrollTo(0, 0));
    const start = await page.locator('.board').boundingBox();
    await page.locator('.cell.legal').first().tap();
    await page.waitForTimeout(800);
    await page.locator('.cell.legal').first().tap();
    await page.locator('.placement-controls').waitFor();
    await page.locator('.placement-controls').scrollIntoViewIfNeeded();
    if (width === 390) assert.ok(await page.locator('.game-layout').evaluate(el => {
      const bottom = document.querySelector('.global-hud').getBoundingClientRect().top;
      return [...el.querySelectorAll('.player-card')].every(card => card.getBoundingClientRect().bottom <= bottom);
    }), 'Four player inventories remain above the utility bar at 390×740');
    const board = await page.locator('.board').boundingBox();
    assert.equal(Math.round(board.width), Math.round(start.width), 'Actions must not shrink the board');
    const buttons = page.locator('.placement-options>button');
    assert.equal(await buttons.count(), 6);
    const boxes = await buttons.evaluateAll(elements => elements.map(el => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { x:r.x, y:r.y, right:r.right, height:r.height, hit:hit === el || el.contains(hit) };
    }));
    if (process.env.LAYOUT_SCREENSHOT_DIR) await page.screenshot({ path:`${process.env.LAYOUT_SCREENSHOT_DIR}/actions-${language}-${width}.png`, fullPage:true });
    assert.ok(boxes.every(b => Math.abs(b.y - boxes[0].y) < 2 && b.x >= 0 && b.right <= width && b.height >= 44 && b.hit), `Reachable single-row actions: ${width} ${JSON.stringify(boxes)}`);
    await buttons.nth(1).tap();
    assert.equal(await buttons.nth(1).getAttribute('aria-pressed'), 'true', 'Single tap selects the large meteor');
    assert.equal(await page.locator('.placement-controls').count(), 1, 'Selecting a meteor must not place it on the board');
    await page.locator('.shell').evaluate(el => el.classList.add('text-size-xlarge'));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Large text must not create horizontal scrolling');
    await page.close();
  }
  console.log('PASS: Japanese/English mobile actions at 320/390/430; stable board, six reachable controls, single-tap selection');
} finally { await browser.close(); }

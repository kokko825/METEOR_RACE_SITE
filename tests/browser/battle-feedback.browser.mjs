import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TEST_ORIGIN || 'http://localhost:3000';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const browser = await chromium.launch({ headless: true, ...(process.env.TEST_BROWSER_PATH ? { executablePath: process.env.TEST_BROWSER_PATH } : {}) });
try {
  for (const reducedMotion of ['no-preference', 'reduce']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(language => {
      window.localStorage.setItem('meteor-race-language', language);
      window.inventoryFeedbackCount = 0;
      const original = Element.prototype.animate;
      Element.prototype.animate = function (...args) {
        if (this.matches('.inventory')) window.inventoryFeedbackCount++;
        return original.apply(this, args);
      };
    }, reducedMotion === 'reduce' ? 'en' : 'ja');
    await page.goto(origin);
    await page.waitForTimeout(1000);
    await page.locator('.title-start').click();
    await page.locator('.entry-confirm').click();
    await page.locator('.entry-confirm').click();
    await page.locator('.board:visible').waitFor();
    assert.equal(await page.locator('.battle-atmosphere').getAttribute('aria-hidden'), 'true');
    assert.equal(await page.locator('.battle-atmosphere').evaluate(el => getComputedStyle(el).pointerEvents), 'none');
    assert.equal(await page.evaluate(() => window.inventoryFeedbackCount), 0, 'No false inventory update at match start');
    assert.equal(await page.locator('.battle-orbit').evaluate(el => getComputedStyle(el).animationName), reducedMotion === 'reduce' ? 'none' : 'battle-orbit-drift');
    if (process.env.LAYOUT_SCREENSHOT_DIR && reducedMotion === 'no-preference') await page.screenshot({ path: `${process.env.LAYOUT_SCREENSHOT_DIR}/battle-desktop-duel.png` });
    await page.locator('.cell.legal').first().click();
    await page.locator('.cell.legal').first().click();
    await page.locator('.placement-controls').waitFor();
    for (const width of [320, 390, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(150);
      const row = await page.locator('.placement-options').evaluate(el => {
        const boxes = [...el.children].map(button => button.getBoundingClientRect());
        return { count: boxes.length, rows: new Set(boxes.map(box => Math.round(box.top))).size, overflow: boxes.some(box => box.left < 0 || box.right > innerWidth) };
      });
      assert.deepEqual(row, { count: 3, rows: 1, overflow: false }, `Classic meteor choices fit one row at ${width}px`);
      if (process.env.LAYOUT_SCREENSHOT_DIR && reducedMotion === 'no-preference' && [390, 1440].includes(width)) await page.screenshot({ path: `${process.env.LAYOUT_SCREENSHOT_DIR}/meteor-controls-${width}.png`, fullPage: true });
    }
    await page.locator('.cell.placeable').first().click();
    await page.waitForTimeout(3000); // Meteor landing and shockwave finish before inventory is displayed.
    assert.equal(await page.evaluate(() => window.inventoryFeedbackCount > 0), reducedMotion !== 'reduce', 'Inventory feedback follows real consumption and reduced-motion preference');
    await page.setViewportSize({ width: 390, height: 740 });
    assert.equal(await page.locator('.battle-atmosphere').evaluate(el => getComputedStyle(el).display), 'none');
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('PASS: background isolation, real inventory feedback, reduced motion and mobile background suppression');
} finally { await browser.close(); }

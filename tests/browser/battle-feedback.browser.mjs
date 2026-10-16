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
    await page.addInitScript(() => {
      window.inventoryFeedbackCount = 0;
      const original = Element.prototype.animate;
      Element.prototype.animate = function (...args) {
        if (this.matches('.inventory')) window.inventoryFeedbackCount++;
        return original.apply(this, args);
      };
    });
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

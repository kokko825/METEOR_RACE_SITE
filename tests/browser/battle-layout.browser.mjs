import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TEST_ORIGIN || 'http://localhost:3000';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const browser = await chromium.launch({ headless: true, ...(process.env.TEST_BROWSER_PATH ? { executablePath: process.env.TEST_BROWSER_PATH } : {}) });
let checked = 0;
try {
  for (const scenario of [{ items: false, count: 2 }, { items: false, count: 3 }, { items: false, count: 4 }, { items: false, count: 4, team: true }, { items: true, count: 2 }, { items: true, count: 4 }, { items: true, count: 4, team: true }]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(origin);
    await page.waitForTimeout(1000); // Wait for hydration before clicking SSR buttons.
    await page.locator('.title-start').click();
    await page.locator('.entry-confirm').click();
    if (scenario.items) await page.locator('.entry-panel .choice-row').first().locator('button').nth(1).click();
    if (scenario.team) await page.getByRole('button', { name: /2 VS 2/ }).click();
    else for (let i = 2; i < scenario.count; i++) await page.locator('.cpu-stepper button').last().click();
    if (scenario.items) await page.locator('.entry-settings select').first().selectOption('13');
    await page.locator('.entry-confirm').click();
    if (scenario.items) {
      for (let i = 0; i < 2; i++) {
        await page.locator('.switch-setup-controls button.shield').click();
        await page.locator('.switch-setup-controls button.booster').click();
        await page.locator('.switch-setup-controls button.blast').click();
        await page.locator('.setup-confirm-actions button').first().click();
      }
    }
    await page.locator('.board:visible').waitFor();
    for (const [width, height] of [[320, 700], [390, 740], [768, 1024], [1024, 768], [1440, 900]]) {
      await page.setViewportSize({ width, height });
      for (const textSize of ['standard', 'xlarge']) {
        await page.locator('.shell').evaluate((el, size) => {
          el.classList.remove('text-size-standard', 'text-size-xlarge');
          el.classList.add(`text-size-${size}`);
        }, textSize);
        await page.waitForTimeout(150);
        const issue = await page.locator('.game-layout').evaluate(layout => {
          const board = layout.querySelector('.board').getBoundingClientRect();
          if (Math.abs(board.width - board.height) > 2) return 'Non-square board';
          if (board.left < -1 || board.right > innerWidth + 1) return 'Board outside viewport';
          const boxes = [...layout.querySelectorAll('.player-card, .board, .action-panel')].map(el => ({ name: el.className, box: el.getBoundingClientRect() })).filter(({ box }) => box.width && box.height);
          for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i].box, b = boxes[j].box;
            if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) return `${boxes[i].name} overlaps ${boxes[j].name}`;
          }
          for (const slot of layout.querySelectorAll('.inventory-slot')) {
            const r = slot.getBoundingClientRect(), parent = slot.closest('.player-card').getBoundingClientRect();
            if (r.right > parent.right + 1 || r.left < parent.left - 1) return 'Inventory outside flag';
          }
          return null;
        });
        assert.equal(issue, null, JSON.stringify({ scenario, width, textSize }));
        checked++;
      }
    }
    if (process.env.LAYOUT_SCREENSHOT_DIR && scenario.team) await page.screenshot({ path: `${process.env.LAYOUT_SCREENSHOT_DIR}/battle-desktop-${scenario.items ? 'item' : 'classic'}.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 740 });
    await page.locator('.shell').evaluate(el => el.classList.replace('text-size-xlarge', 'text-size-standard'));
    await page.waitForTimeout(200);
    const before = await page.locator('.board').boundingBox();
    await page.locator('.cell.legal').first().click();
    await page.waitForTimeout(1000);
    const after = await page.locator('.board').boundingBox();
    assert.equal(Math.round(before.width), Math.round(after.width), 'Phase changes must not resize the board');
    if (scenario.count === 2) {
      await page.locator('.cell.legal').first().click();
      await page.locator('.cell.placeable').first().waitFor();
      assert.equal(Math.round((await page.locator('.board').boundingBox()).width), Math.round(before.width), 'Meteor controls must not resize the board');
      await page.locator('.action-panel button').first().evaluate(el => el.scrollIntoView({ block: 'center' }));
      assert.ok(await page.locator('.action-panel button').first().evaluate(el => { const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return hit === el || el.contains(hit); }), 'Meteor button is reachable');
    }
    if (process.env.LAYOUT_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.LAYOUT_SCREENSHOT_DIR}/battle-${scenario.items ? 'item' : 'classic'}-${scenario.team ? 'team' : scenario.count}.png`, fullPage: true });
    await page.close();
  }
  console.log(`PASS: ${checked} battle layout conditions; stable board across actions`);
} finally { await browser.close(); }

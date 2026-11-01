import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:3001';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const browser = await chromium.launch({ headless: true, ...(process.env.TEST_BROWSER_PATH ? { executablePath: process.env.TEST_BROWSER_PATH } : {}) });
try {
  for (const width of [390, 1440]) for (const off of [false, true]) for (const kind of (process.env.TEST_ITEMS?.split(',') || ['booster','shield','holo','pulse','blast','recall'])) {
    const page = await browser.newPage({ viewport: { width, height: width === 390 ? 840 : 960 } });
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const language = process.env.TEST_LANGUAGE || 'ja';
    await page.addInitScript(({off, language}) => { localStorage.setItem('meteor-race-effects', off ? 'off' : 'on'); localStorage.setItem('meteor-race-master-volume','0'); localStorage.setItem('meteor-race-language', language); }, {off, language});
    await page.goto(origin);
    await page.locator('.title-start').waitFor();
    await page.waitForTimeout(700);
    await page.locator('.title-start').click();
    await page.locator('.choice-row.three button').nth(1).click();
    await page.locator('.entry-confirm').click();
    await page.locator('.entry-panel .choice-row').first().locator('button').nth(1).click();
    await page.locator('.entry-confirm').click();
    for (let p = 0; p < 2; p++) {
      for (const item of [kind,...['shield','booster','holo'].filter(x => x !== kind)].slice(0,3)) await page.locator(`.switch-setup-controls button.${item}`).click();
      await page.locator('.setup-confirm-actions button').first().click();
    }
    let used = false;
    let placements = 0;
    for (let step = 0; step < 18 && !used; step++) {
      const item = page.locator(`.action-panel button.item-choice.${kind}`).first();
      if (await item.count() && await item.isEnabled()) {
        await item.click();
        if (['holo','pulse','blast'].includes(kind)) await page.locator('.cell.placeable').first().click();
        used = true;
      } else {
        const cells = page.locator('.cell.legal, .cell.placeable');
        await cells.first().waitFor();
        if (kind === 'recall' && await page.locator('.cell.placeable').count()) {
          // Keep each player's meteor far apart so the second one does not destroy the first.
          const options = page.locator('.cell.placeable');
          await options.nth(placements++ % 2 ? await options.count() - 1 : 0).click();
        } else await cells.first().click();
        await page.waitForTimeout(off ? 100 : 2150);
      }
    }
    assert.ok(used, `${kind} was usable`);
    if (off) {
      assert.equal(await page.locator('.switch-activation').count(), 0);
      assert.equal(await page.locator('.board-cue').count(), 0);
      if (kind === 'pulse') assert.ok(await page.locator('.pulse-perimeter').first().isVisible(), 'Disabling effects preserves the gameplay range');
    } else {
      const selector = {booster:'.engine-meter',shield:'.shield-deploy',holo:'.cue-print',pulse:'.pulse-perimeter',blast:'.blast-origin-wave',recall:'.cue-return'}[kind];
      await page.locator(selector).first().waitFor({state:'attached',timeout:1500});
      const receipt = await page.locator('.switch-activation small').innerText();
      assert.equal(/[ぁ-んァ-ヶ一-龠]/.test(receipt), language === 'ja', 'Activation message follows language');
      if (kind === 'recall') assert.ok(await page.locator('.recall-paths path').count() > 0, 'Return trajectory connects to owner');
      if (kind === 'holo') assert.equal(await page.locator('.obstacle-token.holo-forming').count(), 1, 'Only the newly placed HOLO builds');
      if (['blast','pulse','holo','recall'].includes(kind)) {
        assert.equal(await page.locator('.switch-activation').evaluate(el => getComputedStyle(el).borderTopWidth), '0px', 'No opaque framed panel over the board');
      }
      assert.equal(await page.locator('.cell.legal, .cell.placeable').count(), 0, 'Activation blocks the next action until effects finish');
      if (process.env.LAYOUT_SCREENSHOT_DIR) {
        await page.waitForTimeout(300);
        await page.screenshot({path:`${process.env.LAYOUT_SCREENSHOT_DIR}/${width}-${kind}.png`});
      }
    }
    await page.waitForTimeout(off ? 150 : 1300);
    if (kind === 'booster' && !off) {
      let trailSeen = false;
      for (let turn = 0; turn < 12 && !trailSeen; turn++) {
        const boostCell = page.locator('.cell').filter({has: page.locator('.boost-effect')}).first();
        const origin = (await boostCell.getAttribute('aria-label')).match(/\d+/g).slice(0,2).map(Number);
        const legal = page.locator('.cell.legal');
        const target = await legal.evaluateAll((cells, from) => cells.findIndex(cell => {
          const pos = cell.getAttribute('aria-label').match(/\d+/g).slice(0,2).map(Number);
          return Math.abs(pos[0]-from[0])+Math.abs(pos[1]-from[1]) === 2;
        }), origin);
        if (target >= 0) {
          await legal.nth(target).click();
          await page.locator('.cue-boost').waitFor({state:'attached',timeout:1000});
          assert.equal(await page.locator('.cue-boost i').count(), 6);
          await page.waitForTimeout(160);
          if (process.env.LAYOUT_SCREENSHOT_DIR) await page.screenshot({path:`${process.env.LAYOUT_SCREENSHOT_DIR}/${width}-boost-trail.png`});
          trailSeen = true;
        } else {
          await page.locator('.cell.legal, .cell.placeable').first().click();
          await page.waitForTimeout(1650);
        }
      }
      assert.ok(trailSeen, 'Boost consumption leaves directional afterimages');
    }
    assert.equal(await page.locator('.board-feedback').evaluate(el => getComputedStyle(el).pointerEvents), 'none');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
    assert.deepEqual(errors, []);
    console.log(`PASS ${width} ${kind} effects=${!off}`);
    await page.close();
  }
} finally { await browser.close(); }

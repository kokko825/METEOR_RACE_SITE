import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:3016';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const browser = await chromium.launch({headless:true, executablePath:process.env.TEST_BROWSER_PATH});
try {
  for (const language of ['ja','en']) for (const width of [390,1440]) {
    const page = await browser.newPage({viewport:{width,height:900}});
    await page.addInitScript(value => localStorage.setItem('meteor-race-language',value),language);
    await page.goto(origin);
    await page.waitForTimeout(1200);
    assert.match(await page.locator('meta[name="description"]').getAttribute('content'),/6種類/);
    await page.locator('.title-manual').click();
    await page.locator('.manual-board-overview svg').waitFor();
    assert.ok(await page.locator('.manual-board-overview').evaluate(el => el.getBoundingClientRect().right <= innerWidth));
    await page.keyboard.press('Escape');
    await page.locator('.title-beginner').click();
    assert.equal(await page.locator('.tutorial-confirm .primary-action').innerText(),language==='ja'?'はじめる':'Start');
    await page.locator('.tutorial-confirm .primary-action').click();
    await page.locator('.tutorial-coach').waitFor();
    await page.waitForTimeout(200);
    const boxes=await page.evaluate(()=>({board:document.querySelector('.board').getBoundingClientRect().toJSON(),coach:document.querySelector('.tutorial-coach').getBoundingClientRect().toJSON()}));
    assert.ok(boxes.coach.top >= boxes.board.bottom, JSON.stringify(boxes));
    if(width>900) assert.ok(boxes.coach.bottom <= 824, JSON.stringify({boxes,layout:await page.locator('.arena').evaluate(el=>({height:el.clientHeight,rows:getComputedStyle(el).gridTemplateRows,available:el.style.getPropertyValue('--board-available-size')}))}));
    assert.match(await page.locator('.tutorial-coach small').innerText(),/1 \/ 8/);
    if(process.env.LAYOUT_SCREENSHOT_DIR) await page.screenshot({path:`${process.env.LAYOUT_SCREENSHOT_DIR}/tutorial-${language}-${width}.png`,fullPage:true});
    await page.goto(`${origin}/updates`);
    await page.waitForTimeout(600);
    assert.equal(await page.locator('.release-latest').count(),1);
    const href=await page.locator('.release-version a').last().getAttribute('href');
    await page.goto(`${origin}/updates${href}`);
    await page.waitForTimeout(300);
    assert.ok(await page.locator(href.replaceAll('.', '\\.')).count());
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth+1));
    await page.close();
  }
  console.log('PASS presentation: ja/en × phone/desktop, metadata, manual diagram, tutorial separation, version anchors');
} finally {await browser.close();}

import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin=process.env.TEST_ORIGIN || 'http://localhost:3000';
const kind=process.env.TEST_EVENT || 'geyser';
const multiple=kind==='all';
const marker=kind==='geyser'?'.event-vent-crack':kind==='orbit'?'.event-direction.orbit':kind==='wind'?'.event-board-effect.wind':'.event-board-effect.gravity';
assert.ok(['localhost','127.0.0.1'].includes(new URL(origin).hostname));
const browser=await chromium.launch({headless:true,...(process.env.TEST_BROWSER_PATH?{executablePath:process.env.TEST_BROWSER_PATH}:{})});
try {
  for(const language of (process.env.TEST_EVENT?['ja']:['ja','en'])) for(const [width,height] of (process.env.TEST_EVENT&&!multiple?[[390,720]]:[[390,720],[1440,900]])) {
    const page=await browser.newPage({viewport:{width,height}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(lang=>{localStorage.setItem('meteor-race-language',lang);localStorage.setItem('meteor-race-master-volume','0');},language);
    await page.goto(origin); await page.waitForTimeout(1000);
    await page.locator('.title-start').click();
    await page.getByRole('button',{name:/LOCAL/}).click();
    await page.locator('.entry-confirm').click();
    const controls=page.locator('.entry-panel .event-controls');
    assert.equal(await controls.locator('input[type=checkbox]').count(),4);
    if(multiple){for(const value of ['orbit','geyser','wind','gravity']) await controls.locator(`input[value="${value}"]`).check();}
    else await controls.locator(`input[value="${kind}"]`).check();
    if(multiple) await controls.locator('select').selectOption('3');
    if(multiple) await page.evaluate(()=>{
      window.fieldEventSequence=[];
      new MutationObserver(()=>{
        if(!document.querySelector('.field-event-firing')) return;
        const text=document.querySelector('.event-status b')?.textContent;
        if(text && window.fieldEventSequence.at(-1)!==text) window.fieldEventSequence.push(text);
      }).observe(document.body,{subtree:true,childList:true,characterData:true});
    });
    await page.locator('.entry-confirm').click();
    await page.locator('.event-status').first().waitFor();
    assert.match((await page.locator('.event-status').allTextContents()).join(' '),multiple?/3/:/5/);
    // Stay away from CORE and spend meteors on the edge until a forecast appears.
    for(let action=0;action<40;action++) {
      if(await page.locator(marker).count()) break;
      const choices=page.locator('.cell.legal, .cell.placeable');
      await choices.first().waitFor();
      const index=await choices.evaluateAll(cells=>{
        const scores=cells.map(cell=>{const n=cell.getAttribute('aria-label').match(/\d+/g).map(Number);return Math.abs(n[0]-4)+Math.abs(n[1]-4);});
        return scores.indexOf(Math.max(...scores));
      });
      await choices.nth(index).click(); await page.waitForTimeout(1150);
    }
    assert.ok(await page.locator(marker).count()>0,'Forecast markers visible');
    if(kind==='geyser') assert.equal(await page.locator(marker).count(),4,'Four forecast vents visible');
    assert.match((await page.locator('.event-status').allTextContents()).join(' '),/2/);
    if(kind==='orbit') assert.equal(await page.locator(marker).count(),8,'Two rings with four arrows each');
    if(kind==='gravity'||kind==='wind') assert.equal(await page.locator('.event-board-effect').count(),1,'One shared effect, not a layer per cell');
    assert.equal(await page.locator(marker).first().evaluate(el=>getComputedStyle(el).pointerEvents),'none');
    for(let action=0;action<40;action++) {
      if(!(await page.locator('.field-event-firing').count()) && (await page.locator('.event-status b').allTextContents()).some(t=>t.includes(multiple?'3':'5'))) break;
      const choices=page.locator('.cell.legal, .cell.placeable');
      await choices.first().waitFor();
      const index=await choices.evaluateAll(cells=>{
        const scores=cells.map(cell=>{const n=cell.getAttribute('aria-label').match(/\d+/g).map(Number);return Math.abs(n[0]-4)+Math.abs(n[1]-4);});
        return scores.indexOf(Math.max(...scores));
      });
      await choices.nth(index).click(); await page.waitForTimeout(multiple?5100:1500);
    }
    assert.match((await page.locator('.event-status b').allTextContents()).join(' '),multiple?/3/:/5/,'Event completes and countdown resets');
    if(multiple) assert.deepEqual(await page.evaluate(()=>window.fieldEventSequence.map(s=>s.split(' · ')[0])),['追い風','ランダムORBIT','間欠泉','中央重力'],'Animation follows fixed resolution order');
    const dimensions=await page.locator('.board').boundingBox();
    assert.ok(Math.abs(dimensions.width-dimensions.height)<3,'Board remains square');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false,'No horizontal overflow');
    assert.deepEqual(errors,[]);
    await page.close();
  }
  console.log(`PASS: ${kind} selector, forecast, activation, square board and no overflow`);
} finally {await browser.close();}

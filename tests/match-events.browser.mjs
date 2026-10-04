import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin=process.env.TEST_ORIGIN || 'http://localhost:3000';
const kind=process.env.TEST_EVENT || 'geyser';
const marker=kind==='geyser'?'.event-vent-mound':kind==='orbit'?'.event-direction.orbit':kind==='wind'?'.event-direction.wind':'.cell.event-range';
assert.ok(['localhost','127.0.0.1'].includes(new URL(origin).hostname));
const browser=await chromium.launch({headless:true,...(process.env.TEST_BROWSER_PATH?{executablePath:process.env.TEST_BROWSER_PATH}:{})});
try {
  for(const language of (process.env.TEST_EVENT?['ja']:['ja','en'])) for(const [width,height] of (process.env.TEST_EVENT?[[390,720]]:[[390,720],[1440,900]])) {
    const page=await browser.newPage({viewport:{width,height}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(lang=>{localStorage.setItem('meteor-race-language',lang);localStorage.setItem('meteor-race-master-volume','0');},language);
    await page.goto(origin); await page.waitForTimeout(1000);
    await page.locator('.title-start').click();
    await page.getByRole('button',{name:/LOCAL/}).click();
    await page.locator('.entry-confirm').click();
    const select=page.locator('.entry-panel .event-controls select');
    assert.equal(await select.locator('option').count(),5);
    await select.selectOption(kind);
    await page.locator('.entry-confirm').click();
    await page.locator('.event-status').waitFor();
    assert.match(await page.locator('.event-status').innerText(),/5/);
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
    assert.match(await page.locator('.event-status').innerText(),/2/);
    for(let action=0;action<40;action++) {
      if((await page.locator('.event-status b').innerText()).includes('5')) break;
      const choices=page.locator('.cell.legal, .cell.placeable');
      await choices.first().waitFor();
      const index=await choices.evaluateAll(cells=>{
        const scores=cells.map(cell=>{const n=cell.getAttribute('aria-label').match(/\d+/g).map(Number);return Math.abs(n[0]-4)+Math.abs(n[1]-4);});
        return scores.indexOf(Math.max(...scores));
      });
      await choices.nth(index).click(); await page.waitForTimeout(1500);
    }
    assert.match(await page.locator('.event-status b').innerText(),/5/,'Event completes and countdown resets');
    const dimensions=await page.locator('.board').boundingBox();
    assert.ok(Math.abs(dimensions.width-dimensions.height)<3,'Board remains square');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false,'No horizontal overflow');
    assert.deepEqual(errors,[]);
    await page.close();
  }
  console.log(`PASS: ${kind} selector, forecast, activation, square board and no overflow`);
} finally {await browser.close();}

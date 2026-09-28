import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin=process.env.TEST_ORIGIN || 'http://localhost:5173';
assert.ok(['localhost','127.0.0.1'].includes(new URL(origin).hostname));
const browser=await chromium.launch({headless:true,...(process.env.TEST_BROWSER_PATH?{executablePath:process.env.TEST_BROWSER_PATH}:{})});
try {
  for(const [index,stage] of ['title','rule','match'].entries()){
    const page=await browser.newPage({viewport:{width:390,height:720}});
    await page.goto(origin);await page.waitForTimeout(1000);
    if(stage!=='title') await page.locator('.title-start').click();
    if(stage==='match') await page.locator('.entry-confirm').click();
    await page.getByRole('button',{name:'チュートリアルを始める',exact:true}).filter({visible:true}).click();
    await page.locator('.tutorial-confirm').waitFor();
    assert.equal(await page.locator('.tutorial-confirm h2').innerText(),'チュートリアルを開始しますか？');
    await page.locator('.tutorial-confirm .primary-action').click();
    await page.locator('.tutorial-welcome .tutorial-coach button').click();
    await page.locator('.tutorial-goal .tutorial-coach button').click();
    const cells=page.locator('.cell.legal');
    await cells.nth(index).click();
    await page.locator('.tutorial-first-praise .tutorial-coach button').click();
    await page.locator('.tutorial-rival .tutorial-coach button').click();
    await page.locator('.tutorial-rival-result .tutorial-coach button').click();
    await page.locator('.cell.legal').first().click();
    await page.locator('.tutorial-meteor .cell.placeable').first().click();
    await page.locator('.tutorial-meteor-result .tutorial-coach button').click();
    await page.locator('.tutorial-large .tutorial-coach button').click();
    await page.locator('.tutorial-free .tutorial-coach button').click();
    await page.locator('.tutorial-free-play').waitFor();
    assert.equal(await page.locator('.tutorial-coach:visible').count(),0);
    // Free play stays interactive and does not bring the lesson back.
    for(let turn=0;turn<3;turn++){
      // Animation/CPU completion may expose either the next move or placement.
      // A synchronous count during an animation must not skip a required action.
      await page.locator('.cell.legal, .cell.placeable').first().click();
      await page.waitForTimeout(1800);
      assert.equal(await page.locator('.tutorial-coach:visible').count(),0);
    }
    await page.locator('.game-back:visible').click();
    await page.locator('.title-start').waitFor();
    await page.close();
  }
  console.log('PASS: tutorial launch from title/setup/details, three opening moves, scripted rival, free-play guidance dismissal and exit');
} finally {await browser.close();}

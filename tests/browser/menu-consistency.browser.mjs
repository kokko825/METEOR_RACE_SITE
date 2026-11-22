import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:3016';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const browser = await chromium.launch({headless:true, executablePath:process.env.TEST_BROWSER_PATH});
try {
  for (const language of ['ja','en']) for (const width of [320,390,768,1440]) {
    const page = await browser.newPage({viewport:{width,height:900}});
    await page.addInitScript(value=>localStorage.setItem('meteor-race-language',value),language);
    await page.goto(origin);
    await page.waitForTimeout(1000);
    await page.locator('.title-start').click();
    await page.locator('.choice-row.three button').first().click();
    await page.locator('.entry-confirm').click();
    for (const size of ['standard','xlarge']) {
      await page.locator('.shell').evaluate((el,size)=>{el.classList.remove('text-size-standard','text-size-xlarge');el.classList.add(`text-size-${size}`);},size);
      for (const group of ['board-size','difficulty']) {
        const buttons=page.locator(`[data-choice-group="${group}"] button`);
        await buttons.last().click();
        assert.equal(await page.locator(`[data-choice-group="${group}"] [aria-pressed="true"]`).count(),1);
        for (const button of await buttons.all()) {
          const box=await button.boundingBox();
          assert.ok(box.width>=44 && box.height>=44,JSON.stringify({language,width,size,group,box}));
        }
      }
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${language} ${width} ${size}: overflow`);
      await page.locator('.entry-confirm').scrollIntoViewIfNeeded();
      await page.locator('.entry-confirm').click({trial:true});
    }
    if(process.env.LAYOUT_SCREENSHOT_DIR && language==='ja' && [390,1440].includes(width)) {
      await page.locator('.shell').evaluate(el=>el.classList.remove('text-size-xlarge'));
      await page.screenshot({path:`${process.env.LAYOUT_SCREENSHOT_DIR}/menu-${width}.png`,fullPage:true});
    }
    await page.close();
  }
  console.log('PASS menu consistency: 16 language/viewport/text-size cases, exclusive selection, 44px targets, start accessible');
} finally {await browser.close();}

/* Optional real-browser regression test. Run against a local dev server only.
   PLAYWRIGHT_MODULE can point to a shared Playwright installation. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// The optional shared browser runtime can be installed outside this repository.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TEST_ORIGIN || 'http://localhost:5173';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname), 'Use a local test database, never public rooms');

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.TEST_BROWSER_PATH ? { executablePath: process.env.TEST_BROWSER_PATH } : {}) });
  let count = 0;
  try {
    for (const language of ['ja', 'en']) {
      const page = await browser.newPage({ viewport: { width: 390, height: 670 } });
      await page.addInitScript(lang => {
        localStorage.setItem('meteor-race-language', lang);
        localStorage.setItem('meteor-race-master-volume', '0');
      }, language);
      await page.goto(origin);
      await page.waitForTimeout(1000); // Allow initial client hydration before interacting with SSR buttons.
      await page.locator('.title-start').click();
      await page.getByRole('button', { name: /ONLINE/ }).click();
      await page.locator('.entry-confirm').click();
      await page.locator('.entry-confirm').click();
      await page.locator('input[placeholder="NICKNAME"]').fill('Layout verification');
      await page.getByRole('button', { name: 'CREATE ROOM', exact: true }).click();
      await page.locator('.ai-stepper').waitFor();
      await page.locator('.ai-stepper button').last().click();
      await page.locator('.cpu-member').nth(1).waitFor();
      await page.locator('.ai-stepper button').last().click();
      await page.locator('.cpu-member').nth(2).waitFor();
      for (const team of [false, true]) {
        if (team) {
          await page.locator('.room-rule-console>div').nth(1).locator('button').click();
          await page.locator('.team-room-members').waitFor();
        }
        for (const [width, height] of [[320,568],[390,670],[430,740],[768,1024],[1024,768],[1440,900]]) {
          await page.setViewportSize({width,height});
          for (const size of ['standard','large','xlarge']) {
            // Same classes as the Settings text-size selector, without resetting the room.
            await page.locator('.shell').evaluate((el, value) => {
              el.classList.remove('text-size-standard','text-size-large','text-size-xlarge');
              el.classList.add(`text-size-${value}`);
            }, size);
            const issue = await page.locator('.online-panel').evaluate(panel => {
              const visible = [...panel.children].filter(el => el.getBoundingClientRect().height && getComputedStyle(el).display !== 'none');
              for (let i=0;i<visible.length;i++) for (let j=i+1;j<visible.length;j++) {
                const a=visible[i].getBoundingClientRect(), b=visible[j].getBoundingClientRect();
                if (Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1) return `Overlap: ${visible[i].className} / ${visible[j].className}`;
              }
              const box=panel.getBoundingClientRect();
              for (const el of panel.querySelectorAll('button,select')) {
                if (!el.getBoundingClientRect().height) continue;
                const r=el.getBoundingClientRect();
                if (r.left<box.left-1 || r.right>box.right+1) return `Overflow: ${el.textContent}`;
              }
              return null;
            });
            assert.equal(issue, null, `${language}/${team}/${width}/${size}: ${issue}`);
            for (const selector of ['.ai-level-inline select','.ai-stepper button:last-child','.apply-room-settings','.leave-room-button']) {
              const control=page.locator(selector);
              await control.evaluate(el => el.scrollIntoView({block:'center',behavior:'instant'}));
              const reachable=await control.evaluate(el => {
                const r=el.getBoundingClientRect();
                const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
                return hit===el || el.contains(hit);
              });
              assert.ok(reachable, `${language}/${team}/${width}/${size}: covered ${selector}`);
            }
            count++;
          }
        }
      }
      await page.locator('.leave-room-button').click();
      await page.close();
    }
    console.log(`PASS: ${count} lobby layouts; Japanese/English, individual/team, 3 CPUs, 6 viewports, 3 text sizes`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });

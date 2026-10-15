const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const out = path.join(__dirname, '..', 'shots');
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 820 } });
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|ERR_(NAME|INTERNET|CONNECTION|TUNNEL|PROXY)|Failed to load resource/i.test(m.text())) problems.push('console: ' + m.text());
  });
  await page.goto('file://' + path.join(__dirname, '..', 'public', 'index.html'));
  await page.waitForSelector('.hero');
  const heroText = await page.textContent('.hero h1');
  console.log('empty hero:', heroText);

  // Add client
  await page.click('#nav button:has-text("Clients")');
  await page.click('main [data-action=new-client] >> nth=0');
  await page.fill('#name', 'The Mehta family');
  await page.fill('#type', 'Joint family');
  await page.fill('#need', 'A warm home where everyone gathers and feels welcome.');
  await page.fill('#worry', 'the rooms will feel crowded');
  await page.click('[data-role=submit]');
  await page.waitForSelector('.person h3:has-text("The Mehta family")');

  // Add team member
  await page.click('#nav button:has-text("Team")');
  await page.click('main [data-action=new-member] >> nth=0');
  await page.fill('#name', 'Asha');
  await page.fill('#role', '3D artist');
  await page.click('[data-role=submit]');
  await page.waitForSelector('.person h3:has-text("Asha")');

  // Create project
  await page.click('#nav button:has-text("Projects")');
  await page.click('main [data-action=new-project] >> nth=0');
  await page.fill('#name', 'Mehta 3BHK, Ahmedabad');
  await page.click('[data-role=submit]');
  await page.waitForSelector('text=Agree the dates');
  console.log('lock disabled before brief:', await page.isDisabled('[data-action=lock-dates]'));
  // Fill the brief
  const ans = {
    household: 'Six of us: parents, two kids and grandmother.',
    feel: 'Warm and welcoming, like grandmother\'s house.',
    worry: 'The living room will feel crowded.',
    rooms: 'Living, dining, kitchen, three bedrooms.',
    colors: 'Marigold, plum and teal. No grey.',
    budget: '25 to 30 lakh including furniture.',
    occasion: 'Housewarming on 12 December.',
    deciders: 'Both of us, father-in-law decides.',
  };
  for (let i = 0; i < 5; i++) {
    const g = page.locator('.grp-head').nth(i);
    if ((await g.getAttribute('aria-expanded')) !== 'true') await g.click();
  }
  for (const k of Object.keys(ans)) {
    if (await page.$('#bq-' + k)) { await page.fill('#bq-' + k, ans[k]); await page.dispatchEvent('#bq-' + k, 'change'); }
  }
  await page.fill('#dm-concept', 'Zones that keep the living room open for guests');
  await page.dispatchEvent('#dm-concept', 'change');
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(out, '1-plan.png'), fullPage: true });
  console.log('lock disabled after brief:', await page.isDisabled('[data-action=lock-dates]'));

  // Lock
  await page.click('text=Lock the dates');
  await page.waitForSelector('text=Review and deliver');

  // Add task and deliver with a failing review
  await page.fill('#nt-concept', 'Write the emotional goal with the family');
  await page.selectOption('#na-concept', { label: 'Asha' });
  await page.click('form[data-form=add-task] button');
  await page.waitForSelector('.task:has-text("Write the emotional goal")');
  await page.click('.task input[type=checkbox]');
  await page.click('text=Review and deliver >> nth=0');
  await page.waitForSelector('.sheet');
  await page.check('input[name=chk] >> nth=0');
  const label1 = await page.textContent('[data-role=submit]');
  await page.click('[data-role=submit]');
  await page.waitForSelector('.returned');
  console.log('review button before send back:', label1);

  // Pass it on second try
  await page.click('text=Review and deliver >> nth=0');
  const boxes = await page.$$('input[name=chk]');
  for (const b of boxes) await b.check();
  const label2 = await page.textContent('[data-role=submit]');
  await page.click('[data-role=submit]');
  await page.waitForSelector('.node.done');
  console.log('review button when all ticked:', label2);
  await page.screenshot({ path: path.join(out, '2-project.png'), fullPage: true });

  // Today with data, then phone dark
  await page.click('#nav button:has-text("Today")');
  await page.waitForSelector('.hero');
  console.log('today hero:', await page.textContent('.hero h1'));
  await page.screenshot({ path: path.join(out, '3-today.png'), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(out, '4-today-phone-dark.png'), fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log('horizontal overflow at phone width (px):', overflow);

  // Reload: local data persists
  await page.reload();
  await page.waitForSelector('.hero');
  await page.click('#nav button:has-text("Projects")');
  const cards = await page.$$eval('.proj h3', (els) => els.map((e) => e.textContent));
  console.log('projects after reload:', cards);

  console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'no page errors');
  await browser.close();
})().catch((e) => {
  console.error('SMOKE FAILED:', e.message.split('\n').slice(0, 6).join('\n'));
  process.exit(1);
});

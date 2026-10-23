// Headless UI test for the asset register (Stage 3A). Skeleton: the Assets tab is not built yet (a later task shows it), so for now
// it only checks that the app opens as a super admin with no #tab-assets visible. Uses the shared fake (test/_fake.cjs).
const assert = require('assert/strict');
const { chromium } = require('playwright');
const { makeFake, newPage } = require('./_fake.cjs');

async function signIn(page, base){
  await page.goto(base+'/'); await page.waitForTimeout(400);
  await page.fill('#lEmail','jamie@adchem.pro'); await page.fill('#lPass','correct-horse'); await page.click('#btnLogin'); await page.waitForTimeout(1000);
  assert.equal(await page.$eval('#app',e=>e.hidden), false, 'app shown');
}

(async()=>{
  const fake = makeFake(); const T = fake.T; const base = await fake.start();
  T.dispatch_members[0].is_super_admin = true;
  const b = await chromium.launch();
  try {
  const page = await newPage(b, base);
  await signIn(page, base);
  assert.ok(!(await page.$('#tab-assets')) || await page.$eval('#tab-assets', e => e.hidden), 'assets tab not shown yet');
  assert.deepEqual(page.errs, [], 'unexpected page errors');
  } finally { await b.close(); await fake.stop(); }
})().then(()=>{ console.log('assets.test.cjs: ok'); }, e=>{ console.error(e); process.exit(1); });

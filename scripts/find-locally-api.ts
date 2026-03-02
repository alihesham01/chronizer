import puppeteer from 'puppeteer';

async function findApi() {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  // Capture ALL fetch/xhr requests
  const calls: { url: string; method: string; status: number; reqHeaders: Record<string,string>; postData?: string; respBody: string }[] = [];
  page.on('response', async (resp) => {
    const req = resp.request();
    if (req.resourceType() === 'xhr' || req.resourceType() === 'fetch') {
      const body = await resp.text().catch(() => '');
      calls.push({
        url: resp.url(),
        method: req.method(),
        status: resp.status(),
        reqHeaders: req.headers(),
        postData: req.postData()?.substring(0, 500),
        respBody: body.substring(0, 500),
      });
    }
  });

  // Login
  await page.goto('https://portal.locallyeg.com/login', { waitUntil: 'networkidle2', timeout: 30000 });
  const email = await page.$('input[name="email"]');
  const pwd = await page.$('input[type="password"]');
  if (email && pwd) {
    await (email as any).type('woke@locally.com');
    await (pwd as any).type('39187811');
    const btn = await page.$('button[type="submit"]') || await page.$('button');
    if (btn) {
      calls.length = 0;
      await btn.click();
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  console.log('=== LOGIN API CALLS ===');
  calls.forEach(c => {
    console.log(`\n${c.method} ${c.url} → ${c.status}`);
    if (c.postData) console.log('  POST:', c.postData);
    if (c.reqHeaders.authorization) console.log('  Auth:', c.reqHeaders.authorization);
    console.log('  Resp:', c.respBody.substring(0, 300));
  });

  // Check cookies + localStorage
  const cookies = await page.cookies();
  console.log('\n=== COOKIES ===');
  cookies.forEach(c => console.log(`  ${c.name}=${c.value.substring(0, 50)}...`));

  const storage = await page.evaluate(() => {
    const result: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      result[key] = (localStorage.getItem(key) || '').substring(0, 100);
    }
    return result;
  });
  console.log('\n=== LOCAL STORAGE ===');
  Object.entries(storage).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  // Now navigate to orders and capture the API call
  calls.length = 0;
  await page.goto('https://portal.locallyeg.com/orders', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));

  console.log('\n=== ORDERS API CALLS ===');
  calls.forEach(c => {
    console.log(`\n${c.method} ${c.url} → ${c.status}`);
    if (c.reqHeaders.authorization) console.log('  Auth:', c.reqHeaders.authorization.substring(0, 80));
    if (c.reqHeaders.cookie) console.log('  Cookie:', c.reqHeaders.cookie.substring(0, 100));
    console.log('  Resp:', c.respBody.substring(0, 300));
  });

  // Inventory
  calls.length = 0;
  await page.goto('https://portal.locallyeg.com/inventory', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));

  console.log('\n=== INVENTORY API CALLS ===');
  calls.forEach(c => {
    console.log(`\n${c.method} ${c.url} → ${c.status}`);
    if (c.reqHeaders.authorization) console.log('  Auth:', c.reqHeaders.authorization.substring(0, 80));
    console.log('  Resp:', c.respBody.substring(0, 300));
  });

  await browser.close();
}

findApi().catch(e => console.error('FATAL:', e));

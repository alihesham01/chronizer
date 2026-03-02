import puppeteer from 'puppeteer';

async function inspect() {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  // Track API calls
  const apiCalls: { url: string; method: string; status: number; body: string }[] = [];
  page.on('response', async (resp) => {
    const url = resp.url();
    if (url.includes('/api/') || url.includes('login') || url.includes('auth') || url.includes('order') || url.includes('inventory')) {
      try {
        const body = await resp.text().catch(() => '');
        if (resp.request().resourceType() === 'xhr' || resp.request().resourceType() === 'fetch') {
          apiCalls.push({ url, method: resp.request().method(), status: resp.status(), body: body.substring(0, 1000) });
        }
      } catch {}
    }
  });

  // ===================== LOCALLY =====================
  console.log('\n========== LOCALLY PORTAL ==========');
  await page.goto('https://portal.locallyeg.com/login', { waitUntil: 'networkidle2', timeout: 30000 });

  // Get all form elements on login page
  const locallyLogin = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('input, button, a, select'));
    return els.map((el: any) => ({
      tag: el.tagName, type: el.type, name: el.name, id: el.id,
      placeholder: el.placeholder, class: el.className.substring(0, 80),
      text: el.textContent?.trim().substring(0, 50)
    }));
  });
  console.log('Login form elements:', JSON.stringify(locallyLogin, null, 2));

  // Try logging in
  const emailSel = 'input[name="email"]';
  const emailEl = await page.$(emailSel);
  if (emailEl) {
    await emailEl.click({ clickCount: 3 });
    await emailEl.type('woke@locally.com');
    const pwdEl = await page.$('input[type="password"]');
    if (pwdEl) {
      await pwdEl.click({ clickCount: 3 });
      await pwdEl.type('39187811');
    }
    // Click submit
    const btn = await page.$('button[type="submit"]') || await page.$('button');
    if (btn) {
      apiCalls.length = 0; // reset to capture login API
      await btn.click();
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  console.log('After login URL:', page.url());
  console.log('Login API calls:', JSON.stringify(apiCalls, null, 2));

  // Navigate to orders
  apiCalls.length = 0;
  await page.goto('https://portal.locallyeg.com/orders', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));

  console.log('\nOrders page URL:', page.url());
  console.log('Orders API calls:', JSON.stringify(apiCalls, null, 2));

  // Get page structure
  const ordersStructure = await page.evaluate(() => {
    // Get table headers
    const headers = Array.from(document.querySelectorAll('th, thead td')).map(th => th.textContent?.trim());
    // Get first few rows
    const rows = Array.from(document.querySelectorAll('tbody tr')).slice(0, 3).map(tr => {
      return Array.from(tr.querySelectorAll('td')).map(td => td.textContent?.trim().substring(0, 60));
    });
    // Get any filters
    const filters = Array.from(document.querySelectorAll('select, input[type="date"], input[type="text"]')).map((el: any) => ({
      tag: el.tagName, type: el.type, name: el.name, placeholder: el.placeholder, class: el.className.substring(0, 60)
    }));
    const bodyText = document.body.innerText.substring(0, 2000);
    return { headers, rows, filters, bodyText };
  });
  console.log('Orders structure:', JSON.stringify(ordersStructure, null, 2));

  // Navigate to inventory
  apiCalls.length = 0;
  await page.goto('https://portal.locallyeg.com/inventory', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));

  console.log('\nInventory page URL:', page.url());
  console.log('Inventory API calls:', JSON.stringify(apiCalls, null, 2));

  const inventoryStructure = await page.evaluate(() => {
    const headers = Array.from(document.querySelectorAll('th, thead td')).map(th => th.textContent?.trim());
    const rows = Array.from(document.querySelectorAll('tbody tr')).slice(0, 3).map(tr => {
      return Array.from(tr.querySelectorAll('td')).map(td => td.textContent?.trim().substring(0, 60));
    });
    const bodyText = document.body.innerText.substring(0, 2000);
    return { headers, rows, bodyText };
  });
  console.log('Inventory structure:', JSON.stringify(inventoryStructure, null, 2));

  // ===================== MR LOKAL =====================
  console.log('\n\n========== MR LOKAL PORTAL ==========');
  apiCalls.length = 0;

  // Try the main page first to see what's there
  await page.goto('https://mrlocal.store', { waitUntil: 'networkidle2', timeout: 30000 });
  console.log('Mr Lokal main URL:', page.url());

  const mrLokalMain = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a')).map(a => ({ href: a.href, text: a.textContent?.trim().substring(0, 50) }));
    const forms = Array.from(document.querySelectorAll('input, button')).map((el: any) => ({
      tag: el.tagName, type: el.type, name: el.name, placeholder: el.placeholder
    }));
    return { links: links.slice(0, 20), forms, bodyText: document.body.innerText.substring(0, 1500) };
  });
  console.log('Mr Lokal main page:', JSON.stringify(mrLokalMain, null, 2));

  // Try login page
  await page.goto('https://mrlocal.store/my/login', { waitUntil: 'networkidle2', timeout: 30000 });
  console.log('Mr Lokal login URL:', page.url());
  const mrLokalLogin = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('input, button, a')).map((el: any) => ({
      tag: el.tagName, type: el.type, name: el.name, id: el.id,
      placeholder: el.placeholder, text: el.textContent?.trim().substring(0, 50)
    }));
    return { els, bodyText: document.body.innerText.substring(0, 1000) };
  });
  console.log('Mr Lokal login form:', JSON.stringify(mrLokalLogin, null, 2));

  await browser.close();
  console.log('\n✅ Inspection complete');
}

inspect().catch(e => console.error('FATAL:', e));

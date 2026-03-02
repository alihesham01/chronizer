import puppeteer from 'puppeteer';

async function inspect() {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  const apiCalls: { url: string; method: string; status: number; body: string }[] = [];
  page.on('response', async (resp) => {
    const url = resp.url();
    const reqType = resp.request().resourceType();
    if (reqType === 'xhr' || reqType === 'fetch') {
      try {
        const body = await resp.text().catch(() => '');
        apiCalls.push({ url, method: resp.request().method(), status: resp.status(), body: body.substring(0, 2000) });
      } catch {}
    }
  });

  // ===================== LOCALLY - DEEP DIVE =====================
  console.log('========== LOCALLY - DEEP API INSPECTION ==========');
  
  // Login
  await page.goto('https://portal.locallyeg.com/login', { waitUntil: 'networkidle2', timeout: 30000 });
  const emailEl = await page.$('input[name="email"]');
  if (emailEl) {
    await emailEl.type('woke@locally.com');
    const pwdEl = await page.$('input[type="password"]');
    if (pwdEl) await pwdEl.type('39187811');
    const btn = await page.$('button[type="submit"]') || await page.$('button');
    if (btn) {
      apiCalls.length = 0;
      await btn.click();
      await new Promise(r => setTimeout(r, 5000));
    }
  }
  console.log('After login URL:', page.url());
  console.log('Login API calls:', JSON.stringify(apiCalls.filter(c => c.status !== 304), null, 2));

  // Check cookies/localStorage for auth tokens
  const authInfo = await page.evaluate(() => {
    return {
      cookies: document.cookie,
      localStorage: Object.keys(localStorage).reduce((acc: any, key) => {
        acc[key] = localStorage.getItem(key)?.substring(0, 200);
        return acc;
      }, {}),
    };
  });
  console.log('Auth info:', JSON.stringify(authInfo, null, 2));

  // Now go to orders - capture all XHR
  apiCalls.length = 0;
  await page.goto('https://portal.locallyeg.com/orders', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));
  console.log('\nOrders API calls:', JSON.stringify(apiCalls, null, 2));

  // Get all the orders data including pagination info
  const ordersData = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('tbody tr'));
    const data = rows.slice(0, 5).map(tr => {
      const tds = Array.from(tr.querySelectorAll('td'));
      return tds.map(td => td.textContent?.trim());
    });
    const headers = Array.from(document.querySelectorAll('th')).map(th => th.textContent?.trim());
    // Pagination
    const pagination = document.querySelector('[class*="pagination"], [class*="paging"], nav')?.textContent?.trim();
    // Filters
    const selects = Array.from(document.querySelectorAll('select')).map((s: any) => ({
      name: s.name,
      options: Array.from(s.options).map((o: any) => ({ value: o.value, text: o.text }))
    }));
    const dateInputs = Array.from(document.querySelectorAll('input[type="date"]')).map((i: any) => ({ name: i.name, value: i.value }));
    return { headers, data, pagination, selects, dateInputs, totalRows: rows.length };
  });
  console.log('Orders data:', JSON.stringify(ordersData, null, 2));

  // Click on first order to see detail
  const firstOrderLink = await page.$('tbody tr td a') || await page.$('tbody tr');
  if (firstOrderLink) {
    apiCalls.length = 0;
    await firstOrderLink.click();
    await new Promise(r => setTimeout(r, 3000));
    console.log('\nOrder detail URL:', page.url());
    console.log('Order detail API calls:', JSON.stringify(apiCalls, null, 2));
    
    const orderDetail = await page.evaluate(() => {
      return document.body.innerText.substring(0, 2000);
    });
    console.log('Order detail content:', orderDetail);
  }

  // Inventory page
  apiCalls.length = 0;
  await page.goto('https://portal.locallyeg.com/inventory', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));
  console.log('\nInventory API calls:', JSON.stringify(apiCalls, null, 2));

  // ===================== MR LOKAL - ODOO =====================
  console.log('\n\n========== MR LOKAL - ODOO LOGIN ==========');
  apiCalls.length = 0;

  // First select the MrLocal database
  await page.goto('https://mrlocal.store/odoo?db=MrLocal', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));
  console.log('After db select URL:', page.url());

  // Get login form
  const mrLoginForm = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('input, button')).map((el: any) => ({
      tag: el.tagName, type: el.type, name: el.name, id: el.id,
      placeholder: el.placeholder, class: el.className?.substring(0, 60)
    }));
    return { els, bodyText: document.body.innerText.substring(0, 1000) };
  });
  console.log('Mr Lokal login form:', JSON.stringify(mrLoginForm, null, 2));

  // Try to login
  const mrEmail = await page.$('input[name="login"]') || await page.$('#login');
  const mrPwd = await page.$('input[name="password"]') || await page.$('#password');
  if (mrEmail && mrPwd) {
    await mrEmail.click({ clickCount: 3 });
    await (mrEmail as any).type('woke@mrlocal.com');
    await mrPwd.click({ clickCount: 3 });
    await (mrPwd as any).type('123');
    
    const loginBtn = await page.$('button[type="submit"]') || await page.$('.btn-primary');
    if (loginBtn) {
      apiCalls.length = 0;
      await loginBtn.click();
      await new Promise(r => setTimeout(r, 8000));
    }
  }

  console.log('After Odoo login URL:', page.url());
  console.log('Odoo login API calls:', JSON.stringify(apiCalls.filter(c => c.url.includes('web') || c.url.includes('session')).slice(0, 5), null, 2));

  // Try to access POS orders
  apiCalls.length = 0;
  await page.goto('https://mrlocal.store/odoo/point-of-sale/orders', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 5000));
  console.log('\nPOS orders URL:', page.url());

  const posData = await page.evaluate(() => {
    const headers = Array.from(document.querySelectorAll('th')).map(th => th.textContent?.trim());
    const rows = Array.from(document.querySelectorAll('tbody tr, .o_data_row')).slice(0, 3).map(tr => {
      return Array.from(tr.querySelectorAll('td, .o_data_cell')).map(td => td.textContent?.trim().substring(0, 60));
    });
    return { headers, rows, bodyText: document.body.innerText.substring(0, 2000) };
  });
  console.log('POS orders data:', JSON.stringify(posData, null, 2));
  console.log('POS API calls:', JSON.stringify(apiCalls.filter(c => c.url.includes('web') || c.url.includes('pos')).slice(0, 5), null, 2));

  await browser.close();
  console.log('\n✅ Deep inspection complete');
}

inspect().catch(e => console.error('FATAL:', e));

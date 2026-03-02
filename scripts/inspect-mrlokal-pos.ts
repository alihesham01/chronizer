import puppeteer from 'puppeteer';

async function inspect() {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  const apiCalls: { url: string; method: string; status: number; body: string; postData?: string }[] = [];
  page.on('response', async (resp) => {
    const reqType = resp.request().resourceType();
    if (reqType === 'xhr' || reqType === 'fetch') {
      try {
        const body = await resp.text().catch(() => '');
        apiCalls.push({
          url: resp.url(),
          method: resp.request().method(),
          status: resp.status(),
          body: body.substring(0, 3000),
          postData: resp.request().postData()?.substring(0, 500)
        });
      } catch {}
    }
  });

  // Login to Odoo
  await page.goto('https://mrlocal.store/web/login?db=MrLocal', { waitUntil: 'networkidle2', timeout: 30000 });
  const loginField = await page.$('#login');
  const pwdField = await page.$('#password');
  if (loginField && pwdField) {
    await (loginField as any).type('woke@mrlocal.com');
    await (pwdField as any).type('123');
    const btn = await page.$('button[type="submit"]');
    if (btn) {
      await btn.click();
      await new Promise(r => setTimeout(r, 8000));
    }
  }
  console.log('Logged in, URL:', page.url());

  // Navigate to POS Orders link on the my page
  apiCalls.length = 0;
  
  // Try finding and clicking the POS Orders link
  const posOrdersLink = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a'));
    const posLink = links.find(a => a.textContent?.includes('POS Orders') || a.href?.includes('pos/orders'));
    return posLink?.href || null;
  });
  console.log('POS Orders link found:', posOrdersLink);

  if (posOrdersLink) {
    await page.goto(posOrdersLink, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 5000));
  } else {
    // Try direct URL patterns
    const tryUrls = [
      'https://mrlocal.store/my/pos/orders',
      'https://mrlocal.store/my/pos/orders?category_id=&date_from=2026-02-01&date_to=',
    ];
    for (const url of tryUrls) {
      console.log('Trying:', url);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });
      const title = await page.title();
      console.log('Title:', title, 'URL:', page.url());
      if (!title.includes('404')) break;
    }
  }

  console.log('POS Orders page URL:', page.url());
  console.log('POS Orders API calls:', JSON.stringify(apiCalls.slice(0, 10), null, 2));

  const posOrdersContent = await page.evaluate(() => {
    const headers = Array.from(document.querySelectorAll('th, .o_list_header')).map(th => th.textContent?.trim());
    const rows = Array.from(document.querySelectorAll('tbody tr, .o_data_row, table tr')).slice(0, 5).map(tr => {
      return Array.from(tr.querySelectorAll('td, .o_data_cell')).map(td => td.textContent?.trim().substring(0, 80));
    });
    const links = Array.from(document.querySelectorAll('a')).slice(0, 20).map(a => ({ href: a.href, text: a.textContent?.trim().substring(0, 60) }));
    return { headers, rows, links, bodyText: document.body.innerText.substring(0, 3000) };
  });
  console.log('POS Orders content:', JSON.stringify(posOrdersContent, null, 2));

  // Try Stock page
  apiCalls.length = 0;
  const stockLink = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a'));
    const sLink = links.find(a => a.textContent?.includes('Stock') || a.href?.includes('stock'));
    return sLink?.href || null;
  });
  console.log('\nStock link found:', stockLink);

  if (stockLink) {
    await page.goto(stockLink, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 5000));

    console.log('Stock page URL:', page.url());
    const stockContent = await page.evaluate(() => {
      const headers = Array.from(document.querySelectorAll('th')).map(th => th.textContent?.trim());
      const rows = Array.from(document.querySelectorAll('tbody tr, table tr')).slice(0, 5).map(tr => {
        return Array.from(tr.querySelectorAll('td')).map(td => td.textContent?.trim().substring(0, 80));
      });
      return { headers, rows, bodyText: document.body.innerText.substring(0, 3000) };
    });
    console.log('Stock content:', JSON.stringify(stockContent, null, 2));
    console.log('Stock API calls:', JSON.stringify(apiCalls.slice(0, 5), null, 2));
  }

  await browser.close();
  console.log('\n✅ Done');
}

inspect().catch(e => console.error('FATAL:', e));

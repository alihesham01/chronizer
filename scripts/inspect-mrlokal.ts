import puppeteer from 'puppeteer';

async function inspectMrLokal() {
  console.log('Inspecting Mr Lokal login page...');
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    
    // Navigate to login page
    await page.goto('https://mrlocal.store/login', { waitUntil: 'networkidle2' });
    
    // Wait for page to load
    await page.waitForSelector('body', { timeout: 10000 });
    
    // Get page title
    const title = await page.title();
    console.log('Page title:', title);
    console.log('Current URL:', page.url());
    
    // Find all forms
    const forms = await page.evaluate(() => {
      const forms = document.querySelectorAll('form');
      return Array.from(forms).map(form => ({
        action: form.action,
        method: form.method,
        inputs: Array.from(form.querySelectorAll('input')).map(input => ({
          type: input.type,
          name: input.name,
          id: input.id,
          placeholder: input.placeholder,
          className: input.className,
          required: input.required
        }))
      }));
    });
    
    console.log('\nForms found:', JSON.stringify(forms, null, 2));
    
    // Find all input fields (not just in forms)
    const allInputs = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input');
      return Array.from(inputs).map(input => ({
        type: input.type,
        name: input.name,
        id: input.id,
        placeholder: input.placeholder,
        className: input.className,
        parent: input.parentElement?.tagName + (input.parentElement?.className ? '.' + input.parentElement.className : '')
      }));
    });
    
    console.log('\nAll inputs:', JSON.stringify(allInputs, null, 2));
    
    // Try to access the orders page directly
    console.log('\nTrying to access orders page...');
    await page.goto('https://mrlocal.store/my/pos/orders?category_id=&date_from=2026-02-04&date_to=', { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    const ordersUrl = page.url();
    console.log('Orders page URL:', ordersUrl);
    
    // Check if redirected to login
    if (ordersUrl.includes('login')) {
      console.log('Redirected to login - authentication required');
    } else {
      console.log('Orders page accessible!');
      
      // Look for order data
      const orderContent = await page.evaluate(() => {
        const orderRows = document.querySelectorAll('tr, .order, .transaction, [class*="order"], [class*="transaction"]');
        return {
          orderRowCount: orderRows.length,
          pageContent: document.body.innerText.substring(0, 500)
        };
      });
      
      console.log('Order rows found:', orderContent.orderRowCount);
      console.log('Page content preview:', orderContent.pageContent);
    }
    
  } catch (error) {
    console.error('Inspection failed:', error);
  } finally {
    await browser.close();
  }
}

inspectMrLokal().catch(console.error);

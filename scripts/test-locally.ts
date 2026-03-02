import puppeteer from 'puppeteer';

async function testLocally() {
  console.log('Testing Locally scraper...');
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    
    // Enable request interception to see network activity
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      request.continue();
    });
    
    console.log('Navigating to login page...');
    await page.goto('https://portal.locallyeg.com/login', { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    // Wait for the app to render
    await page.waitForSelector('#app', { timeout: 10000 });
    console.log('✓ App container loaded');
    
    // Try different possible selectors for email input
    const possibleSelectors = [
      '#email',
      'input[type="email"]',
      'input[name="email"]',
      'input[placeholder*="email" i]',
      '.email-input',
      '[data-testid="email-input"]'
    ];
    
    let emailInput = null;
    for (const selector of possibleSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 2000 });
        emailInput = await page.$(selector);
        if (emailInput) {
          console.log(`✓ Found email input with selector: ${selector}`);
          break;
        }
      } catch (e) {
        // Continue trying
      }
    }
    
    if (!emailInput) {
      // Let's check what inputs are actually available
      const inputs = await page.evaluate(() => {
        const inputs = document.querySelectorAll('input');
        return Array.from(inputs).map(input => ({
          type: input.type,
          name: input.name,
          id: input.id,
          placeholder: input.placeholder,
          className: input.className
        }));
      });
      
      console.log('Available inputs:', inputs);
      
      // Try to find password input too
      const passwordInputs = inputs.filter(i => i.type === 'password');
      console.log('Password inputs found:', passwordInputs);
      
      // If we find inputs, try to fill them
      if (inputs.length > 0) {
        const firstInput = inputs[0];
        console.log(`Trying to fill first input: ${firstInput.id || firstInput.name || firstInput.className}`);
        
        await page.type(firstInput.id ? `#${firstInput.id}` : firstInput.name ? `[name="${firstInput.name}"]` : 'input:first-child', 'woke@locally.com');
        
        if (passwordInputs.length > 0) {
          const pwdInput = passwordInputs[0];
          await page.type(pwdInput.id ? `#${pwdInput.id}` : pwdInput.name ? `[name="${pwdInput.name}"]` : 'input[type="password"]', '39187811');
          
          // Try to find and click submit button
          const submitButton = await page.$('button[type="submit"], .login-btn, [data-testid="login-button"]');
          if (submitButton) {
            console.log('✓ Found submit button, clicking...');
            await submitButton.click();
            
            // Wait for navigation
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
            console.log('✓ Navigation completed');
            console.log('Current URL:', page.url());
          }
        }
      }
    } else {
      console.log('Email input found, proceeding with login...');
      await emailInput.type('woke@locally.com');
      
      // Find and fill password
      const passwordInput = await page.$('input[type="password"]');
      if (passwordInput) {
        await passwordInput.type('39187811');
        
        // Find and click submit
        const submitButton = await page.$('button[type="submit"]');
        if (submitButton) {
          await submitButton.click();
          await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
          console.log('✓ Login successful!');
          console.log('Current URL:', page.url());
        }
      }
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await browser.close();
  }
}

testLocally().catch(console.error);

import puppeteer from 'puppeteer';

async function debugLocallyLogin() {
  console.log('🔍 Debugging Locally login page...\n');
  
  const browser = await puppeteer.launch({
    headless: false, // Show browser for debugging
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    
    await page.goto('https://portal.locallyeg.com/login', { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    // Wait for the app to render
    await page.waitForSelector('#app', { timeout: 10000 });
    
    // Take screenshot
    await page.screenshot({ path: 'locally-login-debug.png', fullPage: true });
    
    // Get all interactive elements
    const elements = await page.evaluate(() => {
      const result: any = {
        inputs: [],
        buttons: [],
        forms: []
      };
      
      // Get all inputs
      document.querySelectorAll('input').forEach(input => {
        result.inputs.push({
          type: input.type,
          name: input.name,
          id: input.id,
          placeholder: input.placeholder,
          className: input.className,
          value: input.value,
          visible: (input as any).offsetParent !== null
        });
      });
      
      // Get all buttons
      document.querySelectorAll('button, input[type="submit"]').forEach(btn => {
        result.buttons.push({
          tag: btn.tagName,
          type: (btn as HTMLInputElement).type,
          text: btn.textContent,
          className: btn.className,
          visible: (btn as any).offsetParent !== null
        });
      });
      
      // Get forms
      document.querySelectorAll('form').forEach(form => {
        result.forms.push({
          action: form.action,
          method: form.method,
          className: form.className
        });
      });
      
      return result;
    });
    
    console.log('Inputs found:', JSON.stringify(elements.inputs, null, 2));
    console.log('\nButtons found:', JSON.stringify(elements.buttons, null, 2));
    console.log('\nForms found:', JSON.stringify(elements.forms, null, 2));
    
    // Try to fill the form manually
    console.log('\n🔧 Trying to fill form...');
    
    // Find the first input (email)
    const emailInput = await page.$('input');
    if (emailInput) {
      await emailInput.click();
      await emailInput.type('woke@locally.com');
      console.log('✅ Email entered');
    }
    
    // Tab to next field (password)
    await page.keyboard.press('Tab');
    await page.type('woke@locally.com', '39187811');
    console.log('✅ Password entered');
    
    // Try pressing Enter
    await page.keyboard.press('Enter');
    console.log('✅ Pressed Enter');
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('Current URL:', page.url());
    
  } finally {
    // Don't close browser immediately for debugging
    console.log('\nPress Enter to close browser...');
    await new Promise(resolve => {
      process.stdin.once('data', resolve);
    });
    
    await browser.close();
  }
}

debugLocallyLogin().catch(console.error);

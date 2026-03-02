import puppeteer from 'puppeteer';

async function quickTest() {
  console.log('Starting quick test...');
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    
    // Test Locally login
    console.log('Testing Locally login...');
    await page.goto('https://portal.locallyeg.com/login', { waitUntil: 'networkidle2' });
    
    // Check if login page loads
    const emailInput = await page.$('#email');
    if (emailInput) {
      console.log('✓ Login page loaded successfully');
    } else {
      console.log('✗ Login page not loaded correctly');
      
      // Let's see what's actually on the page
      const title = await page.title();
      console.log('Page title:', title);
      const content = await page.content();
      console.log('Page content preview:', content.substring(0, 500));
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await browser.close();
    console.log('Test completed');
  }
}

quickTest().catch(console.error);

import puppeteer from 'puppeteer';

const STORES = {
  'Locally': [
    'https://portal.locallyeg.com/login',
    'https://locallyeg.com/login',
    'https://app.locallyeg.com/login'
  ],
  'MrLokal': [
    'https://mrlocal.store/login',
    'https://mrlocal.store/my/login',
    'https://app.mrlocal.store/login',
    'https://mrlocal.store'
  ],
  'Genz': [
    'https://genz.com.eg/login',
    'https://genz-egypt.com/login',
    'https://app.genz.com.eg/login'
  ],
  'GoNative': [
    'https://gonative.store/login',
    'https://app.gonative.store/login'
  ],
  'Lokal': [
    'https://lokal.com.eg/login',
    'https://lokal-egypt.com/login',
    'https://app.lokal.com.eg/login'
  ]
};

async function discoverUrls() {
  console.log('🔍 Discovering store URLs...\n');
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    
    for (const [storeName, urls] of Object.entries(STORES)) {
      console.log(`\n🏪 ${storeName}`);
      console.log('-'.repeat(40));
      
      for (const url of urls) {
        try {
          console.log(`\nTrying: ${url}`);
          
          const response = await page.goto(url, { 
            waitUntil: 'networkidle2',
            timeout: 15000 
          });
          
          const status = response?.status() || 0;
          const title = await page.title();
          
          console.log(`  Status: ${status}`);
          console.log(`  Title: ${title}`);
          
          if (status === 200 && !title.includes('404') && !title.includes('Not Found')) {
            // Check for login form
            const hasLoginForm = await page.evaluate(() => {
              const inputs = document.querySelectorAll('input[type="email"], input[type="password"], input[name*="email"], input[name*="password"]');
              return inputs.length > 0;
            });
            
            if (hasLoginForm) {
              console.log(`  ✅ Found login form!`);
              
              // Try to find the correct orders/inventory URLs
              const baseUrl = url.replace('/login', '');
              console.log(`  📦 Likely orders URL: ${baseUrl}/orders`);
              console.log(`  📦 Likely inventory URL: ${baseUrl}/inventory`);
            } else {
              console.log(`  ⚠️  No login form found`);
            }
          }
          
        } catch (error) {
          console.log(`  ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }
    
  } finally {
    await browser.close();
  }
  
  console.log('\n✅ URL discovery completed');
}

discoverUrls().catch(console.error);

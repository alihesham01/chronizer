import { StoreScraper } from '../src/scrapers/index.js';

async function testScrapers() {
  const scraper = new StoreScraper();
  
  // Test credentials
  const testCredentials = {
    'Locally': {
      email: 'woke@locally.com',
      password: '39187811'
    },
    'MrLokal': {
      email: 'woke@mrlocal.com',
      password: '123'
    }
    // Add other store credentials as needed
  };

  try {
    await scraper.initialize();
    
    for (const [storeName, credentials] of Object.entries(testCredentials)) {
      console.log(`\n=== Testing ${storeName} ===`);
      
      try {
        // Test transactions
        console.log('Fetching transactions...');
        const transactions = await scraper.scrapeTransactions(storeName, credentials);
        console.log(`✓ Found ${transactions.length} transactions`);
        if (transactions.length > 0) {
          console.log('Sample transaction:', {
            id: transactions[0].id,
            date: transactions[0].date,
            total: transactions[0].total,
            items: transactions[0].items.length
          });
        }
        
        // Test inventory
        console.log('Fetching inventory...');
        const inventory = await scraper.scrapeInventory(storeName, credentials);
        console.log(`✓ Found ${inventory.length} inventory items`);
        if (inventory.length > 0) {
          console.log('Sample item:', {
            sku: inventory[0].sku,
            name: inventory[0].name,
            quantity: inventory[0].quantity,
            price: inventory[0].price
          });
        }
        
      } catch (error) {
        console.error(`✗ Failed to scrape ${storeName}:`, error);
      }
    }
    
  } finally {
    await scraper.close();
  }
}

// Run the test
testScrapers().catch(console.error);

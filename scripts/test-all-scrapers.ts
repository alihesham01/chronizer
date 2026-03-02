import { StoreScraper } from '../src/scrapers/index.js';

async function testAllScrapers() {
  const scraper = new StoreScraper();
  
  // Test credentials for all stores
  const testCredentials = {
    'Locally': {
      email: 'woke@locally.com',
      password: '39187811'
    },
    'MrLokal': {
      email: 'woke@mrlocal.com',
      password: '123'
    }
    // Add other stores as needed:
    // 'Genz': { email: 'your-email', password: 'your-password' },
    // 'GoNative': { email: 'your-email', password: 'your-password' },
    // 'Lokal': { email: 'your-email', password: 'your-password' }
  };

  const results = {
    successful: [] as any[],
    failed: [] as any[]
  };

  try {
    await scraper.initialize();
    console.log('🚀 Starting scraper tests...\n');
    
    for (const [storeName, credentials] of Object.entries(testCredentials)) {
      console.log(`\n📦 Testing ${storeName} Store`);
      console.log('='.repeat(50));
      
      const storeResult = {
        name: storeName,
        transactions: { count: 0, error: null as string | null },
        inventory: { count: 0, error: null as string | null }
      };
      
      // Test transactions
      try {
        console.log('🔄 Fetching transactions...');
        const transactions = await scraper.scrapeTransactions(storeName, credentials);
        storeResult.transactions.count = transactions.length;
        console.log(`✅ Found ${transactions.length} transactions`);
        
        if (transactions.length > 0) {
          console.log('   Sample:', {
            id: transactions[0].id,
            date: transactions[0].date,
            total: transactions[0].total,
            items: transactions[0].items.length
          });
        }
      } catch (error) {
        storeResult.transactions.error = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ Transactions failed:`, storeResult.transactions.error);
      }
      
      // Test inventory
      try {
        console.log('\n🔄 Fetching inventory...');
        const inventory = await scraper.scrapeInventory(storeName, credentials);
        storeResult.inventory.count = inventory.length;
        console.log(`✅ Found ${inventory.length} inventory items`);
        
        if (inventory.length > 0) {
          console.log('   Sample:', {
            sku: inventory[0].sku,
            name: inventory[0].name,
            quantity: inventory[0].quantity,
            price: inventory[0].price
          });
        }
      } catch (error) {
        storeResult.inventory.error = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ Inventory failed:`, storeResult.inventory.error);
      }
      
      // Determine if store test was successful
      if (storeResult.transactions.count > 0 || storeResult.inventory.count > 0) {
        results.successful.push(storeResult);
      } else {
        results.failed.push(storeResult);
      }
    }
    
    // Print summary
    console.log('\n\n📊 Test Summary');
    console.log('='.repeat(50));
    console.log(`✅ Successful stores: ${results.successful.length}`);
    console.log(`❌ Failed stores: ${results.failed.length}`);
    
    if (results.successful.length > 0) {
      console.log('\n✅ Successful:');
      results.successful.forEach(store => {
        console.log(`   ${store.name}: ${store.transactions.count} transactions, ${store.inventory.count} inventory items`);
      });
    }
    
    if (results.failed.length > 0) {
      console.log('\n❌ Failed:');
      results.failed.forEach(store => {
        console.log(`   ${store.name}:`);
        if (store.transactions.error) console.log(`     Transactions: ${store.transactions.error}`);
        if (store.inventory.error) console.log(`     Inventory: ${store.inventory.error}`);
      });
    }
    
    // Recommendations
    console.log('\n💡 Recommendations:');
    if (results.failed.length > 0) {
      console.log('   - Check credentials for failed stores');
      console.log('   - Verify store URLs are still valid');
      console.log('   - Stores may have updated their UI - update selectors');
    }
    if (results.successful.length > 0) {
      console.log('   - Successful scrapers can be integrated into the main system');
      console.log('   - Consider setting up scheduled scraping for these stores');
    }
    
  } finally {
    await scraper.close();
    console.log('\n🏁 Test completed');
  }
}

// Run the test
testAllScrapers().catch(console.error);

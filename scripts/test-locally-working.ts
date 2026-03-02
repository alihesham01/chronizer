import { StoreScraper } from '../src/scrapers/index.js';

async function testLocally() {
  console.log('🧪 Testing Locally scraper with improved implementation...\n');
  
  const scraper = new StoreScraper();
  
  try {
    await scraper.initialize();
    
    const credentials = {
      email: 'woke@locally.com',
      password: '39187811'
    };
    
    // Test transactions
    console.log('📦 Testing transactions...');
    try {
      const transactions = await scraper.scrapeTransactions('locally', credentials);
      console.log(`✅ Found ${transactions.length} transactions`);
      
      if (transactions.length > 0) {
        console.log('Sample transaction:', {
          id: transactions[0].id,
          date: transactions[0].date,
          total: transactions[0].total,
          items: transactions[0].items.length
        });
      }
    } catch (error) {
      console.error('❌ Transactions failed:', error instanceof Error ? error.message : error);
    }
    
    // Test inventory
    console.log('\n📦 Testing inventory...');
    try {
      const inventory = await scraper.scrapeInventory('locally', credentials);
      console.log(`✅ Found ${inventory.length} inventory items`);
      
      if (inventory.length > 0) {
        console.log('Sample items:', inventory.slice(0, 3).map(item => ({
          sku: item.sku,
          name: item.name,
          quantity: item.quantity,
          price: item.price
        })));
      }
    } catch (error) {
      console.error('❌ Inventory failed:', error instanceof Error ? error.message : error);
    }
    
  } finally {
    await scraper.close();
  }
}

testLocally().catch(console.error);

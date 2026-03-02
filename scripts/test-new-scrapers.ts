import { LocallyScraper } from '../src/scrapers/stores/locally.scraper.js';
import { MrLokalScraper } from '../src/scrapers/stores/mrlokal.scraper.js';

async function test() {
  // === LOCALLY (API-based, no Puppeteer) ===
  console.log('========== LOCALLY ==========');
  const locally = new LocallyScraper();
  try {
    const trx = await locally.fetchTransactions(
      { email: 'woke@locally.com', password: '39187811' },
      '2026-02-25' // last few days
    );
    console.log(`✅ Transactions: ${trx.length} rows`);
    if (trx.length > 0) {
      console.log('   First:', JSON.stringify(trx[0]));
      console.log('   Last:', JSON.stringify(trx[trx.length - 1]));
    }
  } catch (e: any) {
    console.error('❌ Locally transactions failed:', e.message);
  }

  try {
    const inv = await locally.fetchInventory(
      { email: 'woke@locally.com', password: '39187811' }
    );
    console.log(`✅ Inventory: ${inv.length} items`);
    if (inv.length > 0) {
      console.log('   First:', JSON.stringify(inv[0]));
      console.log('   Sample with stock:', JSON.stringify(inv.find(i => i.quantity > 0)));
    }
  } catch (e: any) {
    console.error('❌ Locally inventory failed:', e.message);
  }

  // === MR LOKAL (Puppeteer-based) ===
  console.log('\n========== MR LOKAL ==========');
  const mrlokal = new MrLokalScraper();
  try {
    const trx = await mrlokal.fetchTransactions(
      { email: 'woke@mrlocal.com', password: '123' },
      '2026-02-25'
    );
    console.log(`✅ Transactions: ${trx.length} rows`);
    if (trx.length > 0) {
      console.log('   First:', JSON.stringify(trx[0]));
      console.log('   Last:', JSON.stringify(trx[trx.length - 1]));
    }
  } catch (e: any) {
    console.error('❌ Mr Lokal transactions failed:', e.message);
  }

  try {
    const inv = await mrlokal.fetchInventory(
      { email: 'woke@mrlocal.com', password: '123' }
    );
    console.log(`✅ Inventory: ${inv.length} items`);
    if (inv.length > 0) {
      console.log('   First:', JSON.stringify(inv[0]));
    }
  } catch (e: any) {
    console.error('❌ Mr Lokal inventory failed:', e.message);
  }

  console.log('\n✅ Done');
}

test().catch(e => console.error('FATAL:', e));

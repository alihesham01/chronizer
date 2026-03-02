import { PortalScraper, StoreCredentials, ScrapedTransaction, ScrapedInventory } from './types.js';
import { LocallyScraper } from './stores/locally.scraper.js';
import { MrLokalScraper } from './stores/mrlokal.scraper.js';

/** Map of store chain name → scraper factory */
const SCRAPERS: Record<string, () => PortalScraper> = {
  'locally':    () => new LocallyScraper(),
  'mr local':   () => new MrLokalScraper(),
  'mr lokal':   () => new MrLokalScraper(),
  'mrlocal':    () => new MrLokalScraper(),
  // Future: 'go native', 'gen-z', 'lokal'
};

/** Check if a scraper exists for this store chain */
export function hasScraper(storeName: string): boolean {
  return storeName.toLowerCase().trim() in SCRAPERS;
}

export function getScraper(storeName: string): PortalScraper {
  const key = storeName.toLowerCase().trim();
  const factory = SCRAPERS[key];
  if (!factory) {
    throw new Error(`No scraper available for "${storeName}". Supported: ${Object.keys(SCRAPERS).join(', ')}`);
  }
  return factory();
}

export async function scrapeTransactions(
  storeName: string,
  creds: StoreCredentials,
  dateFrom?: string,
  dateTo?: string
): Promise<ScrapedTransaction[]> {
  const scraper = getScraper(storeName);
  return scraper.fetchTransactions(creds, dateFrom, dateTo);
}

export async function scrapeInventory(
  storeName: string,
  creds: StoreCredentials
): Promise<ScrapedInventory[]> {
  const scraper = getScraper(storeName);
  return scraper.fetchInventory(creds);
}

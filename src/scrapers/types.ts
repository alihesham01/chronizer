// Common types for all scrapers

export interface StoreCredentials {
  email: string;
  password: string;
}

/** One line-item from a POS order */
export interface ScrapedTransaction {
  date: string;           // ISO or "DD/MM/YYYY HH:mm"
  sku: string;            // barcode / product ref
  product_name: string;
  quantity: number;        // can be negative (returns)
  unit_price: number;
  total: number;
  customer?: string;
  external_order_id?: string;
}

/** One inventory row */
export interface ScrapedInventory {
  sku: string;            // barcode / product ref
  product_name: string;
  quantity: number;        // available stock
  price?: number;
}

/** Every portal scraper must implement this */
export interface PortalScraper {
  /** Fetch transactions, optionally filtered by date range */
  fetchTransactions(
    creds: StoreCredentials,
    dateFrom?: string,   // YYYY-MM-DD
    dateTo?: string
  ): Promise<ScrapedTransaction[]>;

  /** Fetch current inventory snapshot */
  fetchInventory(creds: StoreCredentials): Promise<ScrapedInventory[]>;
}

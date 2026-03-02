import { PortalScraper, StoreCredentials, ScrapedTransaction, ScrapedInventory } from '../types.js';

/**
 * Locally portal scraper.
 * Uses Bearer-token auth against backend.locallyeg.com JSON-RPC API.
 *
 * Login:  POST /api/login  { login, password } → { data: { token } }
 * Orders: POST /api/dashboard/partner/orders   (Bearer token)
 * Stock:  GET  /api/dashboard/partner/products  (Bearer token)
 */
export class LocallyScraper implements PortalScraper {
  private token: string = '';
  private baseUrl = 'https://backend.locallyeg.com';

  private async login(creds: StoreCredentials): Promise<void> {
    const resp = await fetch(`${this.baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: creds.email, password: creds.password }),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`Locally login failed (${resp.status}): ${body.substring(0, 200)}`);
    }

    const json = await resp.json();
    this.token = json?.data?.token;
    if (!this.token) {
      throw new Error('Locally login succeeded but no token returned');
    }
  }

  private authHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.token}`,
    };
  }

  async fetchTransactions(
    creds: StoreCredentials,
    dateFrom?: string,
    dateTo?: string
  ): Promise<ScrapedTransaction[]> {
    await this.login(creds);

    // Orders endpoint is POST; body can include date filters
    const body: Record<string, string> = {};
    if (dateFrom) body.start_date = dateFrom;
    if (dateTo) body.end_date = dateTo;

    const resp = await fetch(`${this.baseUrl}/api/dashboard/partner/orders`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      throw new Error(`Locally orders API failed (${resp.status})`);
    }

    const json = await resp.json();
    const orders: any[] = json?.result?.data || json?.data || [];

    return orders.map((o: any) => ({
      date: o.order_date || o.date || '',
      sku: o.barcode || '',
      product_name: (o.name || '').replace(/^\[.*?\]\s*/, ''),
      quantity: Number(o.quantity) || 0,
      unit_price: Number(o.price) || 0,
      total: Number(o.total) || 0,
      external_order_id: o.order_id ? String(o.order_id) : undefined,
    }));
  }

  async fetchInventory(creds: StoreCredentials): Promise<ScrapedInventory[]> {
    await this.login(creds);

    const resp = await fetch(`${this.baseUrl}/api/dashboard/partner/products`, {
      headers: this.authHeaders(),
    });

    if (!resp.ok) {
      throw new Error(`Locally inventory API failed (${resp.status})`);
    }

    const json = await resp.json();
    const products: any[] = json?.result?.data || json?.data || [];

    return products.map((p: any) => ({
      sku: p.barcode || '',
      product_name: (p.name || '').replace(/^\[.*?\]\s*/, ''),
      quantity: Number(p.stock) || 0,
      price: Number(p.list_price) || 0,
    }));
  }
}

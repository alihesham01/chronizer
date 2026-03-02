import puppeteer, { Browser, Page } from 'puppeteer';
import { PortalScraper, StoreCredentials, ScrapedTransaction, ScrapedInventory } from '../types.js';

/**
 * Mr Lokal portal scraper (Odoo instance at mrlocal.store).
 * Uses Puppeteer because Odoo uses CSRF tokens + server-rendered HTML tables.
 */
export class MrLokalScraper implements PortalScraper {
  private browser: Browser | null = null;
  private page: Page | null = null;

  private async init(): Promise<Page> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    }
    if (!this.page || this.page.isClosed()) {
      this.page = await this.browser.newPage();
    }
    return this.page;
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  private async login(page: Page, creds: StoreCredentials): Promise<void> {
    await page.goto('https://mrlocal.store/web/login?db=MrLocal', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    const loginField = await page.$('#login');
    const pwdField = await page.$('#password');
    if (!loginField || !pwdField) {
      throw new Error('Mr Lokal login form not found');
    }

    await loginField.click({ clickCount: 3 });
    await (loginField as any).type(creds.email);
    await pwdField.click({ clickCount: 3 });
    await (pwdField as any).type(creds.password);

    const submitBtn = await page.$('button[type="submit"]');
    if (!submitBtn) throw new Error('Mr Lokal submit button not found');

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }),
      submitBtn.click(),
    ]);

    const url = page.url();
    if (url.includes('/web/login')) {
      throw new Error('Mr Lokal login failed — still on login page');
    }
  }

  async fetchTransactions(
    creds: StoreCredentials,
    dateFrom?: string,
    dateTo?: string
  ): Promise<ScrapedTransaction[]> {
    const page = await this.init();

    try {
      await this.login(page, creds);

      // Build URL with date filters
      let url = 'https://mrlocal.store/my/pos/orders?category_id=';
      if (dateFrom) url += `&date_from=${dateFrom}`;
      if (dateTo) url += `&date_to=${dateTo}`;

      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      // Parse the HTML table
      const rows = await page.evaluate(() => {
        const trs = Array.from(document.querySelectorAll('tbody tr'));
        return trs
          .filter(tr => tr.querySelectorAll('td').length >= 6)
          .map(tr => {
            const tds = Array.from(tr.querySelectorAll('td'));
            return {
              date: tds[0]?.textContent?.trim() || '',
              customer: tds[1]?.textContent?.trim() || '',
              product: tds[2]?.textContent?.trim() || '',
              category: tds[3]?.textContent?.trim() || '',
              qty: tds[4]?.textContent?.trim() || '0',
              price: tds[5]?.textContent?.trim() || '0',
              total: tds[6]?.textContent?.trim() || '0',
            };
          });
      });

      return rows.map(r => ({
        date: this.parseMrLokalDate(r.date),
        sku: '', // Mr Lokal doesn't show barcodes in POS orders
        product_name: r.product,
        quantity: parseFloat(r.qty) || 0,
        unit_price: parseFloat(r.price) || 0,
        total: parseFloat(r.total) || 0,
        customer: r.customer || undefined,
      }));
    } finally {
      await this.close();
    }
  }

  async fetchInventory(creds: StoreCredentials): Promise<ScrapedInventory[]> {
    const page = await this.init();

    try {
      await this.login(page, creds);

      await page.goto('https://mrlocal.store/my/pos/stock', {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      const rows = await page.evaluate(() => {
        const trs = Array.from(document.querySelectorAll('tbody tr'));
        return trs
          .filter(tr => tr.querySelectorAll('td').length >= 4)
          .map(tr => {
            const tds = Array.from(tr.querySelectorAll('td'));
            return {
              product: tds[0]?.textContent?.trim() || '',
              reference: tds[1]?.textContent?.trim() || '',
              category: tds[2]?.textContent?.trim() || '',
              available: tds[3]?.textContent?.trim() || '0',
            };
          });
      });

      return rows.map(r => ({
        sku: r.reference || r.product, // Use reference if available, else product name
        product_name: r.product,
        quantity: parseFloat(r.available) || 0,
      }));
    } finally {
      await this.close();
    }
  }

  /** Convert "DD/MM/YYYY HH:mm" → ISO string */
  private parseMrLokalDate(dateStr: string): string {
    // "28/02/2026 15:47" → "2026-02-28T15:47:00"
    const match = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
    if (match) {
      return `${match[3]}-${match[2]}-${match[1]}T${match[4]}:${match[5]}:00`;
    }
    return dateStr;
  }
}

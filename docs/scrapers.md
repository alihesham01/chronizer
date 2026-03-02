# Store Scrapers Documentation

## Overview

The scraper system allows fetching transactions and inventory from external store portals. It supports multiple stores and handles authentication, data extraction, and storage automatically.

## Supported Stores

| Store | Transactions | Inventory | Status |
|-------|-------------|-----------|--------|
| Genz | ✅ (needs optimization) | ✅ (needs fixes) | Implemented |
| Go Native | ✅ | ✅ | Implemented |
| Locally | ✅ | ✅ | Implemented |
| Lokal | ✅ (needs fixes) | ✅ (via n8n webhook) | Implemented |
| Mr Lokal | ✅ | ✅ | Implemented |

## Architecture

```
src/scrapers/
├── index.ts              # Main exports
├── types.ts              # Common types
├── store-scraper.ts      # Orchestrator class
└── stores/
    ├── genz.ts           # Genz scraper
    ├── gonative.ts       # Go Native scraper
    ├── locally.ts        # Locally scraper
    ├── lokal.ts          # Lokal scraper
    └── mrlokal.ts        # Mr Lokal scraper
```

## API Endpoints

### Store Credentials

- `GET /api/scrapers/credentials` - List all store credentials
- `POST /api/scrapers/credentials` - Add/update store credentials
- `DELETE /api/scrapers/credentials/:storeName` - Delete store credentials

### Scraping

- `POST /api/scrapers/scrape/:storeName` - Scrape a specific store
- `POST /api/scrapers/scrape-all` - Scrape all configured stores

## Database Schema

### store_credentials
Stores encrypted credentials for each store:
- `brand_id` - Brand identifier
- `store_name` - Store name (Genz, Go Native, etc.)
- `email` - Login email
- `password_hash` - Encrypted password
- `api_key` - Optional API key
- `api_url` - Optional API URL

### transaction_items
Detailed transaction data:
- `transaction_id` - Reference to main transaction
- `sku` - Product SKU
- `item_name` - Product name
- `quantity` - Quantity sold
- `price` - Unit price

### inventory_snapshots
Historical inventory data:
- `brand_id` - Brand identifier
- `sku` - Product SKU
- `quantity` - Current quantity
- `price` - Unit price
- `snapshot_date` - When snapshot was taken

## Usage Example

### 1. Add Store Credentials

```javascript
POST /api/scrapers/credentials
{
  "storeName": "Locally",
  "email": "woke@locally.com",
  "password": "39187811"
}
```

### 2. Scrape a Store

```javascript
POST /api/scrapers/scrape/Locally
```

### 3. Scrape All Stores

```javascript
POST /api/scrapers/scrape-all
```

## Testing

Run the test script to verify scrapers work:

```bash
npm install
tsx scripts/test-scrapers.ts
```

## Security

- Passwords are encrypted using PostgreSQL's `pgp_sym_encrypt`
- RLS policies ensure brands can only access their own credentials
- All scraping operations are logged in the audit trail

## Performance Considerations

- Each scraper runs in its own page context
- Pages are closed after each scrape to free memory
- Consider implementing rate limiting for frequent scrapes
- Large transaction histories may need pagination

## Troubleshooting

### Common Issues

1. **Login Failed**
   - Check credentials are correct
   - Verify store URLs are still valid
   - Check if store requires CAPTCHA

2. **No Data Found**
   - Store might have no transactions/inventory
   - Check if selectors need updating (store changed UI)
   - Verify user has permissions to view data

3. **Slow Performance**
   - Consider reducing date range for transaction scrapes
   - Implement pagination for large datasets
   - Use headless mode (already enabled)

### Adding a New Store

1. Create a new scraper in `src/scrapers/stores/`
2. Implement `scrapeTransactions()` and `scrapeInventory()` methods
3. Add the store to `StoreScraper` class
4. Update the documentation

## Automation

To set up automatic scraping:

1. Create a cron job or scheduled task
2. Call `/api/scrapers/scrape-all` endpoint
3. Monitor logs for failures
4. Set up alerts for scraping errors

## Future Improvements

- [ ] Implement retry logic for failed scrapes
- [ ] Add support for incremental scraping
- [ ] Create dashboard for scraping status
- [ ] Add webhook support for real-time updates
- [ ] Implement caching for frequently accessed data

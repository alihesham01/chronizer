# Shopify Integration Design
**Handling messy data & multiple courier formats**

---

## 1. Architecture Overview

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Shopify   │────▶│  Webhook     │────▶│  Parser     │
│   Store     │     │  Receiver    │     │  Engine     │
└─────────────┘     └──────────────┘     └─────┬───────┘
                                                │
┌─────────────┐     ┌──────────────┐     ┌─────▼───────┐
│   Courier   │────▶│  Tracking    │────▶│  Normalizer │
│   APIs      │     │  Poller      │     │  Service    │
└─────────────┘     └──────────────┘     └─────┬───────┘
                                                │
┌─────────────┐     ┌──────────────┐     ┌─────▼───────┐
│   Admin     │────▶│  Mapping     │────▶│  Transaction│
│   Config    │     │  Rules       │     │  Service    │
└─────────────┘     └──────────────┘     └─────────────┘
```

---

## 2. Data Flow Strategy

### 2.1 Primary Source: Shopify Webhooks (Recommended)

**Why webhooks?**
- Real-time data (no polling delays)
- Complete order data including customer info
- Includes fulfillment data
- Shopify retries on failure (up to 48 hours)

**Required webhooks:**
```typescript
// Webhook topics to register
const WEBHOOK_TOPICS = [
  'orders/create',           // New order
  'orders/updated',          // Order changes (payment, fulfillment)
  'orders/cancelled',        // Cancelled orders
  'orders/fulfilled',        // When order ships
  'refunds/create'           // Returns/refunds
];
```

### 2.2 Fallback: Shopify API Polling (Backup)

For brands that can't configure webhooks:
```typescript
// Poll every 15 minutes for orders updated in last 20 minutes
const POLL_INTERVAL = 15 * 60 * 1000;
const LOOKBACK_MINUTES = 20;
```

---

## 3. Handling Messy Data

### 3.1 The Problem with Shopify Data

1. **Variant titles are inconsistent**: "T-Shirt Red M" vs "T-Shirt - Red - M"
2. **SKUs may be missing**: Custom products often have no SKU
3. **Line item properties**: Customizations stored as key-value pairs
4. **Discounts applied**: Can be at order or line item level
5. **Multiple fulfillments**: One order can ship in multiple packages
6. **Currency variations**: Some brands sell in multiple currencies

### 3.2 Smart Parsing Strategy

```typescript
// src/parsers/shopify-parser.ts

interface ParsedOrder {
  orderId: string;
  orderNumber: string;
  date: Date;
  status: 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
  customer: {
    email?: string;
    phone?: string;
    name: string;
  };
  items: ParsedItem[];
  totals: {
    subtotal: number;
    tax: number;
    shipping: number;
    discount: number;
    total: number;
  };
  currency: string;
  channel: string; // Online Store, POS, etc.
  location?: string; // Physical store if POS
}

interface ParsedItem {
  sku?: string;
  name: string;
  variant: string;
  quantity: number;
  price: number;
  total: number;
  properties: Record<string, string>; // Customizations
  vendor?: string; // Product vendor
  productType?: string;
}

class ShopifyParser {
  private brandId: string;
  private mappingRules: MappingRule[];

  constructor(brandId: string) {
    this.brandId = brandId;
    this.mappingRules = this.loadMappingRules(brandId);
  }

  // Main parsing method
  parseOrder(shopifyOrder: any): ParsedOrder {
    // 1. Extract basic info
    const order: ParsedOrder = {
      orderId: shopifyOrder.id,
      orderNumber: shopifyOrder.name.replace('#', ''),
      date: new Date(shopifyOrder.created_at),
      status: this.mapStatus(shopifyOrder),
      customer: this.parseCustomer(shopifyOrder.customer),
      items: [],
      totals: this.parseTotals(shopifyOrder),
      currency: shopifyOrder.currency,
      channel: shopifyOrder.checkout?.source_name || 'Online Store'
    };

    // 2. Parse line items with smart SKU resolution
    order.items = shopifyOrder.line_items.map(item => 
      this.parseLineItem(item, shopifyOrder)
    );

    // 3. Apply brand-specific cleaning rules
    return this.applyCleaningRules(order);
  }

  private parseLineItem(item: any, order: any): ParsedItem {
    // Extract SKU with fallback strategies
    let sku = item.sku;
    
    if (!sku) {
      // Strategy 1: Generate from variant title
      sku = this.generateSkuFromVariant(item);
      
      // Strategy 2: Use product handle + variant ID
      if (!sku) {
        sku = `${item.product_handle}-${item.variant_id}`;
      }
      
      // Strategy 3: Use title hash
      if (!sku) {
        sku = `AUTO-${this.hashString(item.title)}-${item.variant_id}`;
      }
    }

    // Clean variant title
    const variant = this.cleanVariantTitle(item.variant_title || item.title);

    return {
      sku,
      name: item.title,
      variant,
      quantity: item.quantity,
      price: parseFloat(item.price),
      total: parseFloat(item.price) * item.quantity,
      properties: this.parseProperties(item.properties),
      vendor: item.vendor,
      productType: item.product_type
    };
  }

  private cleanVariantTitle(title: string): string {
    // Standardize variant titles
    return title
      .replace(/\s*-\s*/g, ' ')          // "T-Shirt - Red - M" → "T-Shirt Red M"
      .replace(/\s*\|\s*/g, ' ')          // "T-Shirt | Red | M" → "T-Shirt Red M"
      .replace(/\s*\/\s*/g, ' ')          // "T-Shirt / Red / M" → "T-Shirt Red M"
      .replace(/\s+/g, ' ')                // Multiple spaces → single space
      .trim();
  }

  private parseProperties(properties: any[]): Record<string, string> {
    const result: Record<string, string> = {};
    
    if (!Array.isArray(properties)) return result;
    
    properties.forEach(prop => {
      // Skip empty properties
      if (!prop.name || !prop.value) return;
      
      // Clean property names
      const key = prop.name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_');
      
      result[key] = prop.value;
    });
    
    return result;
  }

  private applyCleaningRules(order: ParsedOrder): ParsedOrder {
    // Apply brand-specific rules
    this.mappingRules.forEach(rule => {
      order = rule.apply(order);
    });
    
    return order;
  }
}
```

### 3.3 Mapping Rules Engine

```typescript
// src/services/mapping-rules.service.ts

interface MappingRule {
  id: string;
  name: string;
  type: 'sku_mapping' | 'category_mapping' | 'channel_mapping' | 'custom';
  conditions: RuleCondition[];
  actions: RuleAction[];
  priority: number;
}

interface RuleCondition {
  field: string; // e.g., 'item.name', 'customer.email'
  operator: 'contains' | 'equals' | 'matches' | 'starts_with';
  value: string;
}

interface RuleAction {
  type: 'set_sku' | 'set_category' | 'set_channel' | 'transform';
  params: any;
}

class MappingRulesService {
  // Example rule: Map custom t-shirt SKUs
  private static readonly EXAMPLE_RULES: MappingRule[] = [
    {
      id: 'tshirt-sku-cleanup',
      name: 'T-Shirt SKU Cleanup',
      type: 'sku_mapping',
      priority: 1,
      conditions: [
        { field: 'item.name', operator: 'contains', value: 'T-Shirt' }
      ],
      actions: [
        { 
          type: 'transform', 
          params: {
            field: 'item.sku',
            pattern: 'TSHIRT-(.+)-(.+)', // Extract size and color
            replacement: 'TS-$1-$2'
          }
        }
      ]
    },
    {
      id: 'online-channel-detection',
      name: 'Detect Online Channels',
      type: 'channel_mapping',
      priority: 2,
      conditions: [
        { field: 'order.source', operator: 'contains', value: 'online' }
      ],
      actions: [
        { type: 'set_channel', params: { value: 'Online Store' } }
      ]
    }
  ];

  async getRulesForBrand(brandId: string): Promise<MappingRule[]> {
    // Load from database with defaults
    const customRules = await db.query(
      'SELECT * FROM mapping_rules WHERE brand_id = $1 ORDER BY priority ASC',
      [brandId]
    );
    
    return [...EXAMPLE_RULES, ...customRules.rows];
  }

  async createRule(brandId: string, rule: Omit<MappingRule, 'id'>): Promise<MappingRule> {
    const result = await db.query(
      `INSERT INTO mapping_rules (brand_id, name, type, conditions, actions, priority)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [brandId, rule.name, rule.type, JSON.stringify(rule.conditions), 
       JSON.stringify(rule.actions), rule.priority]
    );
    
    return result.rows[0];
  }
}
```

---

## 4. Courier Integration Strategy

### 4.1 The Challenge

Each courier has different data:
- **Aramex**: JSON API with tracking status, delivery date, recipient name
- **SMSA**: XML API with different field names
- **DHL**: REST API with nested shipment events
- **FedEx**: SOAP API (legacy) with complex structures

### 4.2 Unified Courier Interface

```typescript
// src/couriers/base-courier.ts

interface CourierTracking {
  trackingNumber: string;
  status: 'picked' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'exception';
  location?: string;
  timestamp: Date;
  details?: any;
  estimatedDelivery?: Date;
  recipient?: string;
}

abstract class BaseCourier {
  protected brandId: string;
  protected credentials: any;

  constructor(brandId: string, credentials: any) {
    this.brandId = brandId;
    this.credentials = credentials;
  }

  // Abstract methods to implement
  abstract trackShipment(trackingNumber: string): Promise<CourierTracking>;
  abstract validateCredentials(): Promise<boolean>;
  abstract getRequiredCredentials(): string[];

  // Common methods
  async updateTracking(trackingNumber: string): Promise<void> {
    const tracking = await this.trackShipment(trackingNumber);
    
    // Update in database
    await db.query(
      `UPDATE shipments 
       SET status = $1, location = $2, last_updated = $3, details = $4
       WHERE tracking_number = $5 AND brand_id = $6`,
      [tracking.status, tracking.location, tracking.timestamp, 
       JSON.stringify(tracking.details), trackingNumber, this.brandId]
    );
  }
}

// Implementation for Aramex
class AramexCourier extends BaseCourier {
  async trackShipment(trackingNumber: string): Promise<CourierTracking> {
    const response = await fetch('https://ws.aramex.net/ShippingAPI.V2/Tracking/Service_1_0.svc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ClientInfo: this.credentials,
        Shipments: [{ Key: trackingNumber }]
      })
    });

    const data = await response.json();
    
    return {
      trackingNumber,
      status: this.mapAramexStatus(data.TrackingResults[0].UpdateCode),
      location: data.TrackingResults[0].UpdateLocation,
      timestamp: new Date(data.TrackingResults[0].UpdateDateTime),
      details: data.TrackingResults[0]
    };
  }

  private mapAramexStatus(code: string): CourierTracking['status'] {
    const statusMap: Record<string, CourierTracking['status']> = {
      '10': 'picked',
      '12': 'in_transit',
      '15': 'out_for_delivery',
      '20': 'delivered',
      '30': 'exception'
    };
    return statusMap[code] || 'in_transit';
  }
}
```

### 4.2 Courier Auto-Detection

```typescript
// src/services/courier-detection.service.ts

class CourierDetectionService {
  private couriers: Map<string, typeof BaseCourier> = new Map([
    ['aramex', AramexCourier],
    ['smsa', SMSACourier],
    ['dhl', DHLCourier],
    ['fedex', FedExCourier]
  ]);

  // Detect courier from tracking number format
  detectCourier(trackingNumber: string): string | null {
    // Aramex: 10-12 digits
    if (/^\d{10,12}$/.test(trackingNumber)) return 'aramex';
    
    // SMSA: Starts with numbers, ends with 'SA'
    if (/^\d+SA$/i.test(trackingNumber)) return 'smsa';
    
    // DHL: 10-11 digits
    if (/^\d{10,11}$/.test(trackingNumber)) return 'dhl';
    
    // FedEx: 12 or 15 digits
    if (/^\d{12}$/.test(trackingNumber) || /^\d{15}$/.test(trackingNumber)) return 'fedex';
    
    return null;
  }

  // Detect from fulfillment data in Shopify
  async detectFromShopifyFulfillment(fulfillment: any): Promise<string | null> {
    // Check tracking_company field
    if (fulfillment.tracking_company) {
      const company = fulfillment.tracking_company.toLowerCase();
      for (const [key] of this.couriers) {
        if (company.includes(key)) return key;
      }
    }

    // Check tracking URL patterns
    if (fulfillment.tracking_url) {
      const url = fulfillment.tracking_url.toLowerCase();
      if (url.includes('aramex')) return 'aramex';
      if (url.includes('smsa')) return 'smsa';
      if (url.includes('dhl')) return 'dhl';
      if (url.includes('fedex')) return 'fedex';
    }

    // Fall back to tracking number format
    return fulfillment.tracking_number 
      ? this.detectCourier(fulfillment.tracking_number)
      : null;
  }
}
```

---

## 5. Database Schema Additions

```sql
-- Courier credentials per brand
CREATE TABLE courier_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    courier_name VARCHAR(50) NOT NULL, -- aramex, smsa, dhl, fedex
    credentials JSONB NOT NULL, -- API keys, account numbers, etc.
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(brand_id, courier_name)
);

-- Shopify store connections
CREATE TABLE shopify_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    shop_domain VARCHAR(255) NOT NULL, -- brand-name.myshopify.com
    access_token TEXT NOT NULL,
    webhook_secret TEXT, -- For webhook verification
    is_active BOOLEAN DEFAULT true,
    last_sync_at TIMESTAMPTZ,
    sync_settings JSONB DEFAULT '{}', -- What to sync, how often
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(brand_id, shop_domain)
);

-- Mapping rules for data cleaning
CREATE TABLE mapping_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL, -- sku_mapping, category_mapping, etc.
    conditions JSONB NOT NULL,
    actions JSONB NOT NULL,
    priority INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Shipment tracking
CREATE TABLE shipments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    transaction_id UUID REFERENCES transactions(id),
    order_number VARCHAR(100) NOT NULL,
    tracking_number VARCHAR(100) NOT NULL,
    courier VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    location TEXT,
    estimated_delivery TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    details JSONB, -- Raw courier response
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(brand_id, tracking_number)
);

-- Shopify sync log
CREATE TABLE shopify_sync_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    sync_type VARCHAR(50) NOT NULL, -- webhook, poll, manual
    shopify_order_id VARCHAR(100),
    transaction_id UUID REFERENCES transactions(id),
    status VARCHAR(20) NOT NULL, -- success, error, skipped
    error_message TEXT,
    data JSONB, -- Full Shopify payload
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 6. Implementation Steps

### Step 1: Shopify Connection Setup (2 days)

```typescript
// src/routes/shopify.routes.ts

// POST /api/shopify/connect
app.post('/connect', async (c) => {
  const { shopDomain, accessToken } = await c.req.json();
  
  // Verify access token
  const shopify = new ShopifyClient(shopDomain, accessToken);
  await shopify.verifyAccess();
  
  // Store connection
  await db.query(
    `INSERT INTO shopify_connections (brand_id, shop_domain, access_token)
     VALUES ($1, $2, $3)
     ON CONFLICT (brand_id, shop_domain) DO UPDATE SET
       access_token = EXCLUDED.access_token,
       updated_at = NOW()`,
    [brandId, shopDomain, accessToken]
  );
  
  // Register webhooks
  await shopify.registerWebhooks([
    { topic: 'orders/create', address: `${WEBHOOK_URL}/shopify/webhooks/orders/create` },
    { topic: 'orders/updated', address: `${WEBHOOK_URL}/shopify/webhooks/orders/updated` },
    // ... other topics
  ]);
  
  return c.json({ success: true });
});
```

### Step 2: Webhook Receiver (1 day)

```typescript
// src/routes/shopify.webhooks.ts

app.post('/webhooks/orders/create', verifyShopifyWebhook, async (c) => {
  const order = await c.req.json();
  
  try {
    const parser = new ShopifyParser(brandId);
    const parsed = parser.parseOrder(order);
    
    // Create transaction
    const transaction = await transactionService.createFromShopify(brandId, parsed);
    
    // Log sync
    await db.query(
      `INSERT INTO shopify_sync_log (brand_id, sync_type, shopify_order_id, transaction_id, status, data)
       VALUES ($1, 'webhook', $2, $3, 'success', $4)`,
      [brandId, order.id, transaction.id, JSON.stringify(order)]
    );
    
    // Extract tracking info if fulfilled
    if (order.fulfillments) {
      await shipmentService.processFulfillments(brandId, order.fulfillments, transaction.id);
    }
    
    return c.json({ status: 'ok' });
  } catch (error) {
    await db.query(
      `INSERT INTO shopify_sync_log (brand_id, sync_type, shopify_order_id, status, error_message, data)
       VALUES ($1, 'webhook', $2, 'error', $3, $4)`,
      [brandId, order.id, error.message, JSON.stringify(order)]
    );
    throw error;
  }
});
```

### Step 3: Courier Integration (3-4 days)

1. Implement base courier class
2. Add Aramex, SMSA, DHL implementations
3. Create auto-detection service
4. Add tracking poller (runs every 30 minutes)

### Step 4: Mapping Rules UI (2 days)

```typescript
// Frontend: Settings > Data Mapping page
// - Visual rule builder
// - Test rules with sample data
// - Preview transformations
// - Rule priority management
```

### Step 5: Dashboard Integration (1 day)

- Show Shopify sync status
- Display tracking updates
- Flag unmapped SKUs from Shopify
- Show mapping rule effectiveness

---

## 7. Automation Features

### 7.1 Smart SKU Auto-Mapping

```typescript
// When an unmapped SKU is detected from Shopify:
class SmartMappingService {
  async suggestMapping(brandId: string, externalSku: string, itemName: string): Promise {
    // 1. Exact match on SKU
    let match = await this.findExactSkuMatch(brandId, externalSku);
    if (match) return match;

    // 2. Fuzzy name match
    match = await this.findFuzzyNameMatch(brandId, itemName);
    if (match?.confidence > 0.8) return match;

    // 3. Extract from variant title
    const extracted = this.extractFromVariant(itemName);
    if (extracted) {
      match = await this.findByComponents(brandId, extracted);
      if (match) return match;
    }

    // 4. Create auto-suggestion record
    await this.createSuggestion(brandId, externalSku, itemName, match);
    
    return null;
  }
}
```

### 7.2 Automatic Courier Updates

```typescript
// Background job to poll tracking updates
class TrackingPoller {
  async run(): Promise<void> {
    const activeShipments = await db.query(
      `SELECT * FROM shipments 
       WHERE status NOT IN ('delivered', 'exception') 
       AND last_updated < NOW() - INTERVAL '30 minutes'`
    );

    for (const shipment of activeShipments.rows) {
      try {
        const courier = this.getCourierInstance(shipment.courier, shipment.brand_id);
        await courier.updateTracking(shipment.tracking_number);
      } catch (error) {
        console.error(`Failed to update ${shipment.tracking_number}:`, error);
      }
    }
  }
}
```

### 7.3 Data Quality Monitoring

```typescript
// Alert on data quality issues
class DataQualityMonitor {
  async checkBrand(brandId: string): Promise<QualityReport> {
    const issues: QualityIssue[] = [];

    // Check for missing SKUs
    const missingSkus = await db.query(
      `SELECT COUNT(*) FROM transactions 
       WHERE brand_id = $1 AND (sku IS NULL OR sku = '') 
       AND created_at > NOW() - INTERVAL '24 hours'`,
      [brandId]
    );

    if (parseInt(missingSkus.rows[0].count) > 10) {
      issues.push({
        type: 'missing_skus',
        severity: 'warning',
        count: parseInt(missingSkus.rows[0].count),
        message: 'High number of transactions without SKUs'
      });
    }

    // Check for unmapped tracking numbers
    const unmappedTracking = await db.query(
      `SELECT COUNT(*) FROM shipments s
       LEFT JOIN transactions t ON s.transaction_id = t.id
       WHERE s.brand_id = $1 AND t.id IS NULL`,
      [brandId]
    );

    return { issues, score: this.calculateScore(issues) };
  }
}
```

---

## 8. Admin Configuration

### 8.1 Shopify Connection Page

```typescript
// Admin can configure Shopify for any brand
interface ShopifyConfig {
  shopDomain: string;
  accessToken: string;
  webhookSecret: string;
  syncSettings: {
    syncOrders: boolean;
    syncFulfillments: boolean;
    syncInventory: boolean;
    pollIntervalMinutes: number;
  };
}
```

### 8.2 Courier Credentials Management

```typescript
// Per-brand courier setup
interface CourierConfig {
  courierName: string;
  credentials: {
    // Aramex
    accountNumber?: string;
    accountPin?: string;
    accountEntity?: string;
    
    // SMSA
    apiKey?: string;
    password?: string;
    
    // DHL
    siteId?: string;
    password?: string;
    accountNumber?: string;
  };
  isActive: boolean;
}
```

---

## 9. Migration Strategy

### Phase 1: Manual Import (Week 1)
- Import existing Shopify orders via CSV export
- Manual courier tracking setup
- Basic mapping rules

### Phase 2: Webhook Integration (Week 2)
- Set up Shopify connections
- Configure webhooks
- Test with new orders

### Phase 3: Full Automation (Week 3-4)
- Enable courier polling
- Deploy smart mapping
- Add data quality monitoring

---

## 10. Error Handling & Edge Cases

### Common Issues:
1. **Duplicate orders**: Shopify can send the same order multiple times
   - Solution: Track `shopify_order_id` in transactions table

2. **Partial fulfillments**: Order ships in multiple packages
   - Solution: Create multiple shipment records linked to same transaction

3. **Currency conversion**: Some brands sell in USD/EUR but report in EGP
   - Solution: Store original currency and converted amount

4. **Refunds and returns**: Need to track separately
   - Solution: Create negative transactions or separate refunds table

5. **API rate limits**: Shopify and courier APIs have limits
   - Solution: Implement exponential backoff and queueing

---

This design provides a robust, automated solution that handles messy data gracefully while supporting multiple courier formats. The mapping rules engine gives brands control over data cleaning without requiring technical expertise.

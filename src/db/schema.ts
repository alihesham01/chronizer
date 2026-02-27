import { 
  pgTable, 
  uuid, 
  varchar, 
  timestamp, 
  integer, 
  decimal, 
  boolean, 
  text,
  index
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm';

// Stores table
export const stores = pgTable('stores', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  displayName: varchar('display_name', { length: 255 }),
  code: varchar('code', { length: 50 }).unique(),
  activationDate: timestamp('activation_date').notNull(),
  deactivationDate: timestamp('deactivation_date'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
}, (table) => ({
  codeIdx: index('idx_stores_code').on(table.code),
  activeIdx: index('idx_stores_active').on(table.isActive)
}));

// Products table
export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  sku: varchar('sku', { length: 100 }).unique().notNull(),
  bigSku: varchar('big_sku', { length: 100 }),
  name: varchar('name', { length: 255 }),
  category: varchar('category', { length: 100 }),
  brand: varchar('brand', { length: 100 }),
  costPrice: decimal('cost_price', { precision: 10, scale: 2 }),
  sellingPrice: decimal('selling_price', { precision: 10, scale: 2 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
}, (table) => ({
  skuIdx: index('idx_products_sku').on(table.sku),
  categoryIdx: index('idx_products_category').on(table.category)
}));

// Transactions hypertable
export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').references(() => products.id),
  storeId: uuid('store_id').references(() => stores.id),
  sku: varchar('sku', { length: 100 }).notNull(),
  storeName: varchar('store_name', { length: 255 }).notNull(),
  quantity: integer('quantity').notNull(),
  sellingPrice: decimal('selling_price', { precision: 10, scale: 2 }).notNull(),
  totalAmount: decimal('total_amount', { precision: 10, scale: 2 }),
  type: varchar('type', { length: 20 }).notNull().$type<'sale' | 'return'>(),
  date: timestamp('date').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
}, (table) => ({
  dateIdx: index('idx_transactions_date').on(table.date.desc()),
  skuIdx: index('idx_transactions_sku').on(table.sku),
  storeIdx: index('idx_transactions_store').on(table.storeId),
  typeIdx: index('idx_transactions_type').on(table.type),
  compositeIdx: index('idx_transactions_composite').on(table.date.desc(), table.storeId, table.type)
}));

// Stock movements hypertable
export const stockMovements = pgTable('stock_movements', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').references(() => products.id),
  storeId: uuid('store_id').references(() => stores.id),
  sku: varchar('sku', { length: 100 }).notNull(),
  storeName: varchar('store_name', { length: 255 }).notNull(),
  quantity: integer('quantity').notNull(),
  type: varchar('type', { length: 20 }).notNull().$type<'in' | 'out' | 'adjustment'>(),
  reason: varchar('reason', { length: 255 }),
  date: timestamp('date').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
}, (table) => ({
  dateIdx: index('idx_stock_movements_date').on(table.date.desc()),
  skuIdx: index('idx_stock_movements_sku').on(table.sku),
  storeIdx: index('idx_stock_movements_store').on(table.storeId)
}));

// Relations
export const storesRelations = relations(stores, ({ many }) => ({
  transactions: many(transactions),
  stockMovements: many(stockMovements)
}));

export const productsRelations = relations(products, ({ many }) => ({
  transactions: many(transactions),
  stockMovements: many(stockMovements)
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  product: one(products, {
    fields: [transactions.productId],
    references: [products.id]
  }),
  store: one(stores, {
    fields: [transactions.storeId],
    references: [stores.id]
  })
}));

export const stockMovementsRelations = relations(stockMovements, ({ one }) => ({
  product: one(products, {
    fields: [stockMovements.productId],
    references: [products.id]
  }),
  store: one(stores, {
    fields: [stockMovements.storeId],
    references: [stores.id]
  })
}));

// Types for use in application
export type Store = typeof stores.$inferSelect;
export type NewStore = typeof stores.$inferInsert;

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;

export type StockMovement = typeof stockMovements.$inferSelect;
export type NewStockMovement = typeof stockMovements.$inferInsert;

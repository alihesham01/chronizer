# Quick Start Guide

## Prerequisites
1. **PostgreSQL** installed and running
   - Default connection: `postgres://woke_user:woke_password_2024@localhost:5432/woke_portal`
   - You can modify this in `.env`

## Step 1: Install Dependencies
```bash
npm install
```

## Step 2: Setup Database
```bash
npm run db:setup
```
This will:
- Create all necessary tables
- Create indexes for performance
- Insert sample data

## Step 3: Start the Server
```bash
npm run dev
```
Server will start at http://localhost:3000

## Step 4: Test the API
Open your browser or use curl:

### Health Check
```bash
curl http://localhost:3000/api/health
```

### Get Transactions
```bash
curl http://localhost:3000/api/transactions
```

### Create a Transaction
```bash
curl -X POST http://localhost:3000/api/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "sku": "TEST001",
    "storeName": "Test Store",
    "quantity": 10,
    "sellingPrice": 99.99,
    "type": "sale",
    "date": "2024-01-01T00:00:00.000Z"
  }'
```

### Bulk Upload Transactions
```bash
curl -X POST http://localhost:3000/api/transactions/bulk \
  -H "Content-Type: application/json" \
  -d '{
    "transactions": [
      {
        "sku": "BULK001",
        "storeName": "Store A",
        "quantity": 5,
        "sellingPrice": 29.99,
        "type": "sale",
        "date": "2024-01-01T00:00:00.000Z"
      }
    ]
  }'
```

## Database Schema
- **stores** - Store information
- **products** - Product catalog
- **transactions** - All transactions (optimized for time-series)
- **stock_movements** - Stock movement tracking

## Performance Features
- Cursor-based pagination (no OFFSET)
- Optimized indexes
- Generated columns for totals
- Materialized views for analytics

## API Endpoints
- `GET /api/transactions` - List with cursor pagination
- `POST /api/transactions` - Create single
- `POST /api/transactions/bulk` - Bulk upload
- `GET /api/transactions/:id` - Get by ID
- `DELETE /api/transactions/:id` - Delete

## Troubleshooting

### Connection Error
Make sure PostgreSQL is running:
```bash
# Windows
net start postgresql-x64-15

# Check if port 5432 is open
netstat -an | findstr 5432
```

### Permission Error
Create the user in PostgreSQL:
```sql
CREATE USER woke_user WITH PASSWORD 'woke_password_2024';
CREATE DATABASE woke_portal OWNER woke_user;
GRANT ALL PRIVILEGES ON DATABASE woke_portal TO woke_user;
```

## Project Structure
```
woke-portal/
├── src/
│   ├── index.ts          # Main server
│   ├── routes/
│   │   └── transactions.ts # Transaction endpoints
│   └── db/
│       ├── index.ts      # Database connection
│       └── schema.ts     # Database schema
├── scripts/
│   └── setup-db.ts       # Database setup script
└── package.json
```

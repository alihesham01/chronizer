# Bulk Upload Performance Guide

## 🚨 Handling 40,000 Transactions

Adding 40,000 transactions at once can cause issues if not handled properly. Here's what you need to know:

## Potential Issues

### Backend Issues
- **Memory Overflow**: Processing 40K records in memory can exceed Node.js limits
- **Database Timeout**: Single large transaction may timeout (default 30 seconds)
- **Connection Pool**: All connections might be exhausted
- **Disk I/O**: Large writes can slow down the server

### Frontend Issues
- **Browser Freeze**: Processing 40K rows synchronously will freeze the UI
- **Memory Crash**: 40K objects in memory can crash browser tabs
- **Network Timeout**: HTTP requests may timeout (usually 30-60 seconds)
- **Rendering**: Trying to display 40K rows will crash the browser

## ✅ Solutions Implemented

### 1. **Chunked Processing**
```javascript
// Backend: Process in batches of 1000
const chunks = [];
for (let i = 0; i < transactions.length; i += 1000) {
  chunks.push(transactions.slice(i, i + 1000));
}
```

### 2. **Streaming Upload**
```javascript
// Frontend: Upload in chunks with progress
const result = await BulkUploadManager.uploadInChunks(
  data,
  uploadFunction,
  { batchSize: 1000, onProgress: updateProgressBar }
);
```

### 3. **Virtual Scrolling**
For displaying large datasets:
- Only render visible rows (e.g., 50 at a time)
- Use libraries like `react-window` or `react-virtualized`
- Lazy load data as user scrolls

### 4. **Background Processing**
```javascript
// Use Web Workers for CSV parsing
const worker = new Worker('/csv-parser.js');
worker.postMessage(largeCSVData);
```

## Performance Recommendations

### For 40,000 Transactions:

1. **Upload Chunk Size**: 1,000 - 2,000 records per chunk
2. **Request Timeout**: Increase to 5 minutes for large uploads
3. **Database**: Use `COPY` command for faster bulk inserts
4. **Memory**: Monitor server memory during large uploads
5. **Progress**: Show real-time progress to user

### Example Upload Flow:

```javascript
// 1. Parse CSV in chunks (prevents UI freeze)
const data = await BulkUploadManager.parseCSVInChunks(csvText, 10000);

// 2. Validate before upload
const validation = BulkUploadManager.validateDataset(data, ['sku', 'quantity']);
if (!validation.valid) {
  showErrors(validation.errors);
  return;
}

// 3. Upload with progress tracking
const { progress, startUpload } = useBulkUpload();

const result = await startUpload(data, async (chunk) => {
  return fetch('/api/transactions/bulk', {
    method: 'POST',
    body: JSON.stringify({ transactions: chunk, batchSize: 1000 })
  });
});
```

## Server Configuration

To handle large uploads, update your server:

1. **Increase Payload Size**:
```javascript
// Express/Hono
app.use(express.json({ limit: '50mb' }));
```

2. **Increase Timeout**:
```javascript
// Server timeout
server.timeout = 300000; // 5 minutes
```

3. **Database Pool**:
```javascript
// Increase pool size
const pool = new Pool({
  max: 20, // Increase from default 10
  idleTimeoutMillis: 30000
});
```

## Monitoring

Monitor these metrics during bulk uploads:
- Memory usage (should stay < 70%)
- Database connections
- Response time per chunk
- Error rate

## Alternative Approaches

For very large datasets (>100K records):

1. **File Upload**: Upload CSV file, process on server
2. **Queue System**: Use Redis/Bull queue for background jobs
3. **Streaming**: Use server-sent events for real-time updates
4. **Database Import**: Use database's native import tools

## Quick Test

To test with 40K records:

```javascript
// Generate test data
const testData = Array.from({ length: 40000 }, (_, i) => ({
  sku: `SKU-${i.toString().padStart(5, '0')}`,
  quantity: Math.floor(Math.random() * 100),
  unit_price: Math.random() * 1000,
  transaction_date: new Date().toISOString()
}));

// Upload with monitoring
console.time('40K Upload');
const result = await bulkUpload(testData);
console.timeEnd('40K Upload');
console.log(`Result: ${result.success} success, ${result.failed} failed`);
```

Expected time for 40K records: **2-5 minutes** with proper chunking.

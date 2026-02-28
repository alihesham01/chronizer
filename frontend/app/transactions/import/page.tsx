'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';

export default function ImportTransactionsPage() {
  const [csvText, setCsvText] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [preview, setPreview] = useState<string[][]>([]);
  const [dateColumn, setDateColumn] = useState('');
  const [skuColumn, setSkuColumn] = useState('');
  const [qtyColumn, setQtyColumn] = useState('');
  const [priceColumn, setPriceColumn] = useState('');
  const [storeColumn, setStoreColumn] = useState('');
  const [statusColumn, setStatusColumn] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvText(text);
      parsePreview(text);
    };
    reader.readAsText(file);
  };

  const parsePreview = (text: string) => {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return;

    const hdrs = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    setHeaders(hdrs);

    const rows = lines.slice(1, 6).map(line => {
      const fields: string[] = [];
      let current = '';
      let inQuotes = false;
      for (const ch of line) {
        if (ch === '"') { inQuotes = !inQuotes; continue; }
        if (ch === ',' && !inQuotes) { fields.push(current.trim()); current = ''; continue; }
        current += ch;
      }
      fields.push(current.trim());
      return fields;
    });
    setPreview(rows);

    // Auto-detect columns
    const lower = hdrs.map(h => h.toLowerCase());
    const dateGuess = hdrs[lower.findIndex(h => h.includes('date'))] || '';
    const skuGuess = hdrs[lower.findIndex(h => h.includes('sku') || h === 'barcode' || h === 'item_code')] || '';
    const qtyGuess = hdrs[lower.findIndex(h => h.includes('qty') || h.includes('quantity'))] || '';
    const priceGuess = hdrs[lower.findIndex(h => h.includes('price') || h.includes('amount') || h.includes('selling'))] || '';
    const storeGuess = hdrs[lower.findIndex(h => h.includes('store') || h.includes('location') || h.includes('outlet'))] || '';

    if (dateGuess) setDateColumn(dateGuess);
    if (skuGuess) setSkuColumn(skuGuess);
    if (qtyGuess) setQtyColumn(qtyGuess);
    if (priceGuess) setPriceColumn(priceGuess);
    if (storeGuess) setStoreColumn(storeGuess);
  };

  const handleImport = async () => {
    if (!csvText || !dateColumn || !skuColumn || !qtyColumn || !priceColumn) {
      setError('Please upload a CSV and map all required columns');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`${API_BASE}/api/transactions/import-csv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ csvText, dateColumn, skuColumn, qtyColumn, priceColumn, storeColumn: storeColumn || undefined, statusColumn: statusColumn || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || 'Import failed');
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const totalRows = csvText ? csvText.split('\n').filter(l => l.trim()).length - 1 : 0;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Import Transactions</h1>
          <p className="text-gray-600">Upload a CSV file to bulk import transactions from external systems</p>
        </div>
        <Link href="/transactions"><Button variant="outline">Back to Transactions</Button></Link>
      </div>

      {error && <Alert variant="destructive" className="mb-4"><AlertDescription>{error}</AlertDescription></Alert>}

      {result && (
        <Alert className={`mb-4 ${result.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
          <AlertDescription className={result.success ? 'text-green-800' : 'text-red-800'}>
            {result.success ? (
              <span><strong>{result.created}</strong> transactions imported successfully. {result.failed > 0 && <span className="text-amber-700">{result.failed} failed.</span>}</span>
            ) : result.error}
          </AlertDescription>
        </Alert>
      )}

      {/* Step 1: Upload CSV */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Step 1: Upload CSV File</CardTitle>
          <CardDescription>Select a CSV file exported from your POS or sales platform</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Input type="file" accept=".csv,.txt" ref={fileRef} onChange={handleFileUpload} />
            {csvText && <Badge className="bg-green-100 text-green-700">{totalRows} rows detected</Badge>}
          </div>
        </CardContent>
      </Card>

      {/* Step 2: Preview + Map Columns */}
      {headers.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Step 2: Map Columns</CardTitle>
            <CardDescription>Match your CSV columns to the required fields. Auto-detection has been applied.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-red-600">Date Column *</Label>
                <select className="w-full border rounded px-3 py-2 text-sm" value={dateColumn} onChange={e => setDateColumn(e.target.value)}>
                  <option value="">Select...</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-red-600">SKU Column *</Label>
                <select className="w-full border rounded px-3 py-2 text-sm" value={skuColumn} onChange={e => setSkuColumn(e.target.value)}>
                  <option value="">Select...</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-red-600">Quantity Column *</Label>
                <select className="w-full border rounded px-3 py-2 text-sm" value={qtyColumn} onChange={e => setQtyColumn(e.target.value)}>
                  <option value="">Select...</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-red-600">Price Column *</Label>
                <select className="w-full border rounded px-3 py-2 text-sm" value={priceColumn} onChange={e => setPriceColumn(e.target.value)}>
                  <option value="">Select...</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div>
                <Label>Store Column (optional)</Label>
                <select className="w-full border rounded px-3 py-2 text-sm" value={storeColumn} onChange={e => setStoreColumn(e.target.value)}>
                  <option value="">None</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div>
                <Label>Status Column (optional)</Label>
                <select className="w-full border rounded px-3 py-2 text-sm" value={statusColumn} onChange={e => setStatusColumn(e.target.value)}>
                  <option value="">None (default: sale)</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            </div>

            {/* Preview table */}
            <div className="mt-4">
              <h4 className="font-medium text-sm mb-2">Preview (first 5 rows):</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border">
                  <thead><tr className="bg-gray-100">
                    {headers.map(h => (
                      <th key={h} className={`px-2 py-1 border text-left ${[dateColumn, skuColumn, qtyColumn, priceColumn, storeColumn, statusColumn].includes(h) ? 'bg-blue-100 font-bold' : ''}`}>
                        {h}
                      </th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i}>
                        {row.map((cell, j) => (
                          <td key={j} className="px-2 py-1 border">{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Import */}
      {headers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Step 3: Import</CardTitle>
            <CardDescription>
              {totalRows} transactions will be imported. SKUs must already exist in your product catalog.
              Store names/codes will be auto-matched.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button size="lg" onClick={handleImport} disabled={loading || !dateColumn || !skuColumn || !qtyColumn || !priceColumn}>
              {loading ? 'Importing...' : `Import ${totalRows} Transactions`}
            </Button>

            {result?.errors && result.errors.length > 0 && (
              <div className="mt-4">
                <h4 className="font-medium text-sm text-red-700 mb-2">Errors (showing first {Math.min(result.errors.length, 50)}):</h4>
                <div className="max-h-48 overflow-y-auto text-xs space-y-1">
                  {result.errors.map((e: any, i: number) => (
                    <div key={i} className="text-red-600">Row {e.row}: {e.error} {e.sku && `(SKU: ${e.sku})`}</div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

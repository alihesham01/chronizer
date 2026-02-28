'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface UnmappedSku {
  id: string;
  external_sku: string;
  store_group: string | null;
  source: string;
  occurrence_count: number;
  status: string;
  first_seen: string;
  last_seen: string;
  mapped_product_name?: string;
  mapped_product_sku?: string;
}

interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
}

export default function UnmappedSkusPage() {
  const router = useRouter();
  const [skus, setSkus] = useState<UnmappedSku[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [summary, setSummary] = useState({ pending: 0, mapped: 0, ignored: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [tab, setTab] = useState('pending');
  const [selectedProduct, setSelectedProduct] = useState<Record<string, string>>({});

  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;

  const fetchSkus = (status: string) => {
    if (!token) { router.push('/login'); return; }
    setLoading(true);
    fetch(`${API_BASE}/api/unmapped-skus?status=${status}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setSkus(data.data);
          setSummary(data.summary);
        } else {
          setError(data.error || 'Failed to load unmapped SKUs');
        }
      })
      .catch(() => setError('Failed to connect to server'))
      .finally(() => setLoading(false));
  };

  const fetchProducts = () => {
    if (!token) return;
    fetch(`${API_BASE}/api/products`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { if (data.success) setProducts(data.data || []); })
      .catch(() => {});
  };

  useEffect(() => { fetchSkus('pending'); fetchProducts(); }, [router]);

  const handleTabChange = (newTab: string) => {
    setTab(newTab);
    fetchSkus(newTab);
  };

  const handleResolve = async (id: string, action: 'map' | 'ignore') => {
    const productId = action === 'map' ? selectedProduct[id] : undefined;
    if (action === 'map' && !productId) {
      setMessage({ type: 'error', text: 'Please select a product to map to' });
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/unmapped-skus/${id}/resolve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action, productId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to resolve SKU');
      setMessage({ type: 'success', text: data.message });
      fetchSkus(tab);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Unmapped SKUs</h1>
          <p className="text-gray-600">Resolve external SKUs that couldn't be matched to products during import</p>
        </div>
        <Link href="/sku-map"><Button variant="outline">Back to SKU Map</Button></Link>
      </div>

      {error && <Alert variant="destructive" className="mb-4"><AlertDescription>{error}</AlertDescription></Alert>}
      {message && (
        <Alert className={`mb-4 ${message.type === 'error' ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}>
          <AlertDescription className={message.type === 'error' ? 'text-red-800' : 'text-green-800'}>{message.text}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card className="bg-amber-50 border-amber-200"><CardContent className="pt-4 pb-3 text-center">
          <p className="text-2xl font-bold text-amber-700">{summary.pending}</p><p className="text-xs text-amber-600">Pending</p>
        </CardContent></Card>
        <Card className="bg-green-50 border-green-200"><CardContent className="pt-4 pb-3 text-center">
          <p className="text-2xl font-bold text-green-700">{summary.mapped}</p><p className="text-xs text-green-600">Mapped</p>
        </CardContent></Card>
        <Card className="bg-gray-50 border-gray-200"><CardContent className="pt-4 pb-3 text-center">
          <p className="text-2xl font-bold text-gray-700">{summary.ignored}</p><p className="text-xs text-gray-600">Ignored</p>
        </CardContent></Card>
      </div>

      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="pending">Pending ({summary.pending})</TabsTrigger>
          <TabsTrigger value="mapped">Mapped ({summary.mapped})</TabsTrigger>
          <TabsTrigger value="ignored">Ignored ({summary.ignored})</TabsTrigger>
        </TabsList>

        <TabsContent value={tab}>
          <Card>
            <CardContent className="pt-4">
              {loading ? <p className="text-gray-500 text-center py-8">Loading...</p> :
               skus.length === 0 ? <p className="text-gray-500 text-center py-8">No {tab} SKUs</p> : (
                <div className="overflow-x-auto"><table className="w-full text-sm">
                  <thead><tr className="border-b text-left">
                    <th className="pb-2 font-medium text-gray-500">External SKU</th>
                    <th className="pb-2 font-medium text-gray-500">Store Group</th>
                    <th className="pb-2 font-medium text-gray-500">Source</th>
                    <th className="pb-2 font-medium text-gray-500 text-center">Count</th>
                    <th className="pb-2 font-medium text-gray-500">Last Seen</th>
                    {tab === 'pending' && <th className="pb-2 font-medium text-gray-500">Map To</th>}
                    {tab === 'mapped' && <th className="pb-2 font-medium text-gray-500">Mapped Product</th>}
                    {tab === 'pending' && <th className="pb-2 font-medium text-gray-500">Actions</th>}
                  </tr></thead>
                  <tbody>{skus.map(s => (
                    <tr key={s.id} className="border-b last:border-0">
                      <td className="py-2 font-mono text-xs font-semibold">{s.external_sku}</td>
                      <td className="py-2">{s.store_group || '-'}</td>
                      <td className="py-2 text-xs">{s.source || '-'}</td>
                      <td className="py-2 text-center font-medium">{s.occurrence_count}</td>
                      <td className="py-2 text-xs text-gray-500">{new Date(s.last_seen).toLocaleDateString()}</td>
                      {tab === 'pending' && (
                        <td className="py-2">
                          <select
                            className="text-xs border rounded px-2 py-1 max-w-[200px]"
                            value={selectedProduct[s.id] || ''}
                            onChange={e => setSelectedProduct(prev => ({ ...prev, [s.id]: e.target.value }))}
                          >
                            <option value="">Select product...</option>
                            {products.map(p => (
                              <option key={p.id} value={p.id}>{p.sku} - {p.name || 'Unnamed'}</option>
                            ))}
                          </select>
                        </td>
                      )}
                      {tab === 'mapped' && (
                        <td className="py-2">
                          <span className="font-mono text-xs">{s.mapped_product_sku}</span>
                          {s.mapped_product_name && <span className="text-gray-500 ml-1 text-xs">({s.mapped_product_name})</span>}
                        </td>
                      )}
                      {tab === 'pending' && (
                        <td className="py-2">
                          <div className="flex gap-1">
                            <Button size="sm" className="text-xs h-7" onClick={() => handleResolve(s.id, 'map')}>Map</Button>
                            <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => handleResolve(s.id, 'ignore')}>Ignore</Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}</tbody>
                </table></div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

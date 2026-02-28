'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

function adminFetch(path: string) {
  const token = localStorage.getItem('auth_token');
  return fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
}

export default function BrandDetailPage() {
  const router = useRouter();
  const params = useParams();
  const brandId = params.brandId as string;

  const [brand, setBrand] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [txnPagination, setTxnPagination] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!localStorage.getItem('auth_token')) { router.push('/login'); return; }

    Promise.all([
      adminFetch(`/api/admin/brands/${brandId}`),
      adminFetch(`/api/admin/brands/${brandId}/products`),
      adminFetch(`/api/admin/brands/${brandId}/stores`),
      adminFetch(`/api/admin/brands/${brandId}/transactions?limit=30`),
      adminFetch(`/api/admin/brands/${brandId}/inventory`),
      adminFetch(`/api/admin/brands/${brandId}/users`),
    ])
      .then(([b, p, s, t, i, u]) => {
        if (b.success) setBrand(b.data);
        else setError(b.error || 'Failed to load brand');
        if (p.success) setProducts(p.data);
        if (s.success) setStores(s.data);
        if (t.success) { setTransactions(t.data); setTxnPagination(t.pagination); }
        if (i.success) setInventory(i.data);
        if (u.success) setUsers(u.data);
      })
      .catch(() => setError('Failed to connect to server'))
      .finally(() => setLoading(false));
  }, [brandId, router]);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><p className="text-gray-500">Loading brand details...</p></div>;
  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md"><CardContent className="pt-6">
        <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
        <Button className="w-full mt-4" onClick={() => router.push('/admin/brands')}>Back to Brands</Button>
      </CardContent></Card>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{brand?.name}</h1>
            <p className="text-gray-500 mt-1">
              <span className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">{brand?.subdomain}</span>
              {' '}{brand?.is_active ? <Badge className="bg-green-100 text-green-700">Active</Badge> : <Badge className="bg-red-100 text-red-700">Inactive</Badge>}
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/admin/brands"><Button variant="outline">Back to Brands</Button></Link>
            <Link href="/admin"><Button variant="outline">Admin Home</Button></Link>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <Card className="bg-blue-50 border-blue-200"><CardContent className="pt-4 pb-3 text-center">
            <p className="text-2xl font-bold text-blue-700">{brand?.product_count || 0}</p><p className="text-xs text-blue-600">Products</p>
          </CardContent></Card>
          <Card className="bg-green-50 border-green-200"><CardContent className="pt-4 pb-3 text-center">
            <p className="text-2xl font-bold text-green-700">{brand?.store_count || 0}</p><p className="text-xs text-green-600">Stores</p>
          </CardContent></Card>
          <Card className="bg-purple-50 border-purple-200"><CardContent className="pt-4 pb-3 text-center">
            <p className="text-2xl font-bold text-purple-700">{parseInt(brand?.transaction_count || '0').toLocaleString()}</p><p className="text-xs text-purple-600">Transactions</p>
          </CardContent></Card>
          <Card className="bg-yellow-50 border-yellow-200"><CardContent className="pt-4 pb-3 text-center">
            <p className="text-2xl font-bold text-yellow-700">${parseFloat(brand?.total_revenue || '0').toLocaleString()}</p><p className="text-xs text-yellow-600">Revenue</p>
          </CardContent></Card>
          <Card className="bg-indigo-50 border-indigo-200"><CardContent className="pt-4 pb-3 text-center">
            <p className="text-2xl font-bold text-indigo-700">{brand?.owner_count || 0}</p><p className="text-xs text-indigo-600">Users</p>
          </CardContent></Card>
          <Card className="bg-red-50 border-red-200"><CardContent className="pt-4 pb-3 text-center">
            <p className="text-2xl font-bold text-red-700">{brand?.stock_move_count || 0}</p><p className="text-xs text-red-600">Stock Moves</p>
          </CardContent></Card>
        </div>

        <Tabs defaultValue="products" className="space-y-4">
          <TabsList>
            <TabsTrigger value="products">Products ({products.length})</TabsTrigger>
            <TabsTrigger value="stores">Stores ({stores.length})</TabsTrigger>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
            <TabsTrigger value="inventory">Inventory ({inventory.length})</TabsTrigger>
            <TabsTrigger value="users">Users ({users.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="products">
            <Card><CardContent className="pt-4">
              {products.length === 0 ? <p className="text-gray-500 text-center py-8">No products</p> : (
                <div className="overflow-x-auto"><table className="w-full text-sm">
                  <thead><tr className="border-b text-left">
                    <th className="pb-2 font-medium text-gray-500">SKU</th>
                    <th className="pb-2 font-medium text-gray-500">Name</th>
                    <th className="pb-2 font-medium text-gray-500">Category</th>
                    <th className="pb-2 font-medium text-gray-500 text-right">Cost</th>
                    <th className="pb-2 font-medium text-gray-500 text-right">Price</th>
                    <th className="pb-2 font-medium text-gray-500">Status</th>
                  </tr></thead>
                  <tbody>{products.map((p: any) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="py-2 font-mono text-xs">{p.sku}</td>
                      <td className="py-2">{p.name || '-'}</td>
                      <td className="py-2">{p.category || '-'}</td>
                      <td className="py-2 text-right">${parseFloat(p.cost_price || 0).toFixed(2)}</td>
                      <td className="py-2 text-right">${parseFloat(p.selling_price || 0).toFixed(2)}</td>
                      <td className="py-2">{p.is_active ? <Badge className="bg-green-100 text-green-700 text-xs">Active</Badge> : <Badge className="bg-red-100 text-red-700 text-xs">Inactive</Badge>}</td>
                    </tr>
                  ))}</tbody>
                </table></div>
              )}
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="stores">
            <Card><CardContent className="pt-4">
              {stores.length === 0 ? <p className="text-gray-500 text-center py-8">No stores</p> : (
                <div className="overflow-x-auto"><table className="w-full text-sm">
                  <thead><tr className="border-b text-left">
                    <th className="pb-2 font-medium text-gray-500">Name</th>
                    <th className="pb-2 font-medium text-gray-500">Code</th>
                    <th className="pb-2 font-medium text-gray-500">Group</th>
                    <th className="pb-2 font-medium text-gray-500">Location</th>
                    <th className="pb-2 font-medium text-gray-500">Status</th>
                  </tr></thead>
                  <tbody>{stores.map((s: any) => (
                    <tr key={s.id} className="border-b last:border-0">
                      <td className="py-2 font-medium">{s.name}</td>
                      <td className="py-2 font-mono text-xs">{s.code || '-'}</td>
                      <td className="py-2">{s.group_name || '-'}</td>
                      <td className="py-2">{s.location || '-'}</td>
                      <td className="py-2">{s.is_active ? <Badge className="bg-green-100 text-green-700 text-xs">Active</Badge> : <Badge className="bg-red-100 text-red-700 text-xs">Inactive</Badge>}</td>
                    </tr>
                  ))}</tbody>
                </table></div>
              )}
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="transactions">
            <Card><CardContent className="pt-4">
              {transactions.length === 0 ? <p className="text-gray-500 text-center py-8">No transactions</p> : (
                <>
                  <div className="overflow-x-auto"><table className="w-full text-sm">
                    <thead><tr className="border-b text-left">
                      <th className="pb-2 font-medium text-gray-500">Date</th>
                      <th className="pb-2 font-medium text-gray-500">SKU</th>
                      <th className="pb-2 font-medium text-gray-500">Store</th>
                      <th className="pb-2 font-medium text-gray-500 text-right">Qty</th>
                      <th className="pb-2 font-medium text-gray-500 text-right">Amount</th>
                      <th className="pb-2 font-medium text-gray-500">Status</th>
                    </tr></thead>
                    <tbody>{transactions.map((t: any) => (
                      <tr key={t.id} className="border-b last:border-0">
                        <td className="py-2 text-xs">{new Date(t.transaction_date).toLocaleDateString()}</td>
                        <td className="py-2 font-mono text-xs">{t.sku}</td>
                        <td className="py-2">{t.store_name || '-'}</td>
                        <td className="py-2 text-right">{t.quantity_sold}</td>
                        <td className="py-2 text-right">${parseFloat(t.total_amount || 0).toFixed(2)}</td>
                        <td className="py-2"><Badge className="text-xs">{t.status}</Badge></td>
                      </tr>
                    ))}</tbody>
                  </table></div>
                  {txnPagination && <p className="text-xs text-gray-500 mt-3 text-center">Showing {transactions.length} of {txnPagination.total} transactions</p>}
                </>
              )}
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="inventory">
            <Card><CardContent className="pt-4">
              {inventory.length === 0 ? <p className="text-gray-500 text-center py-8">No inventory data</p> : (
                <div className="overflow-x-auto"><table className="w-full text-sm">
                  <thead><tr className="border-b text-left">
                    <th className="pb-2 font-medium text-gray-500">SKU</th>
                    <th className="pb-2 font-medium text-gray-500">Name</th>
                    <th className="pb-2 font-medium text-gray-500 text-right">Stock In</th>
                    <th className="pb-2 font-medium text-gray-500 text-right">Stock Out</th>
                    <th className="pb-2 font-medium text-gray-500 text-right">Sold</th>
                    <th className="pb-2 font-medium text-gray-500 text-right">Available</th>
                  </tr></thead>
                  <tbody>{inventory.map((i: any, idx: number) => (
                    <tr key={idx} className="border-b last:border-0">
                      <td className="py-2 font-mono text-xs">{i.sku}</td>
                      <td className="py-2">{i.item_name || '-'}</td>
                      <td className="py-2 text-right">{i.total_stock_in}</td>
                      <td className="py-2 text-right">{i.total_stock_out}</td>
                      <td className="py-2 text-right">{i.total_sold}</td>
                      <td className="py-2 text-right font-semibold">{i.available_stock}</td>
                    </tr>
                  ))}</tbody>
                </table></div>
              )}
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="users">
            <Card><CardContent className="pt-4">
              {users.length === 0 ? <p className="text-gray-500 text-center py-8">No users</p> : (
                <div className="overflow-x-auto"><table className="w-full text-sm">
                  <thead><tr className="border-b text-left">
                    <th className="pb-2 font-medium text-gray-500">Email</th>
                    <th className="pb-2 font-medium text-gray-500">Name</th>
                    <th className="pb-2 font-medium text-gray-500">Role</th>
                    <th className="pb-2 font-medium text-gray-500">Status</th>
                    <th className="pb-2 font-medium text-gray-500">Last Login</th>
                  </tr></thead>
                  <tbody>{users.map((u: any) => (
                    <tr key={u.id} className="border-b last:border-0">
                      <td className="py-2">{u.email}</td>
                      <td className="py-2">{u.first_name} {u.last_name}</td>
                      <td className="py-2"><Badge className="text-xs">{u.role}</Badge></td>
                      <td className="py-2">{u.is_active ? <Badge className="bg-green-100 text-green-700 text-xs">Active</Badge> : <Badge className="bg-red-100 text-red-700 text-xs">Inactive</Badge>}</td>
                      <td className="py-2 text-xs text-gray-500">{u.last_login ? new Date(u.last_login).toLocaleString() : 'Never'}</td>
                    </tr>
                  ))}</tbody>
                </table></div>
              )}
            </CardContent></Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

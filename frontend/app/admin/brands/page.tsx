'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface Brand {
  id: string;
  name: string;
  subdomain: string;
  is_active: boolean;
  owner_count: string;
  transaction_count: string;
  product_count: string;
  store_count: string;
  created_at: string;
}

export default function BrandsPage() {
  const router = useRouter();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      router.push('/login');
      return;
    }

    fetch('/api/admin/brands', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setBrands(data.data);
        } else {
          setError(data.error || 'Failed to load brands');
        }
      })
      .catch(() => setError('Failed to connect to server'))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading brands...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Brand Management</h1>
            <p className="text-gray-500 mt-1">All registered brands and their activity</p>
          </div>
          <Link href="/admin">
            <Button variant="outline">Back to Admin</Button>
          </Link>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Registered Brands ({brands.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {brands.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No brands registered yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-3 font-medium text-gray-500">Brand</th>
                      <th className="pb-3 font-medium text-gray-500">Subdomain</th>
                      <th className="pb-3 font-medium text-gray-500 text-center">Users</th>
                      <th className="pb-3 font-medium text-gray-500 text-center">Transactions</th>
                      <th className="pb-3 font-medium text-gray-500 text-center">Products</th>
                      <th className="pb-3 font-medium text-gray-500 text-center">Stores</th>
                      <th className="pb-3 font-medium text-gray-500">Status</th>
                      <th className="pb-3 font-medium text-gray-500">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {brands.map((brand) => (
                      <tr key={brand.id} className="border-b last:border-0">
                        <td className="py-3 font-medium">{brand.name}</td>
                        <td className="py-3">
                          <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">
                            {brand.subdomain}
                          </span>
                        </td>
                        <td className="py-3 text-center">{brand.owner_count}</td>
                        <td className="py-3 text-center font-medium">{parseInt(brand.transaction_count).toLocaleString()}</td>
                        <td className="py-3 text-center">{brand.product_count}</td>
                        <td className="py-3 text-center">{brand.store_count}</td>
                        <td className="py-3">
                          {brand.is_active ? (
                            <span className="px-2 py-1 rounded-full text-xs bg-green-100 text-green-700">Active</span>
                          ) : (
                            <span className="px-2 py-1 rounded-full text-xs bg-red-100 text-red-700">Inactive</span>
                          )}
                        </td>
                        <td className="py-3 text-gray-500">
                          {new Date(brand.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

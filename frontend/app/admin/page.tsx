'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface AdminStats {
  totals: {
    brands: number;
    owners: number;
    transactions: number;
    products: number;
    stores: number;
    stockMovements: number;
  };
  recentTransactions: { date: string; count: string; total: string }[];
  topBrands: { name: string; subdomain: string; transaction_count: string; total_revenue: string }[];
}

export default function AdminDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      router.push('/login');
      return;
    }

    fetch(`${API_BASE}/api/admin/stats`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setStats(data.data);
        } else {
          setError(data.error || 'Failed to load admin stats');
          if (data.error === 'Admin access required') {
            setError('You do not have admin access. Contact the system administrator.');
          }
        }
      })
      .catch(() => setError('Failed to connect to server'))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading admin dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <Button className="w-full mt-4" onClick={() => router.push('/dashboard')}>
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Admin Portal</h1>
            <p className="text-gray-500 mt-1">System-wide performance and management</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => router.push('/dashboard')}>
              Brand Dashboard
            </Button>
            <Button variant="outline" onClick={() => {
              localStorage.clear();
              router.push('/login');
            }}>
              Logout
            </Button>
          </div>
        </div>

        {/* Quick Nav */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Link href="/admin/invite-codes">
            <Card className="hover:shadow-md transition-shadow cursor-pointer border-blue-200 bg-blue-50">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg text-blue-700">Invite Links</CardTitle>
                <CardDescription>Generate one-time invite links for brand owners</CardDescription>
              </CardHeader>
            </Card>
          </Link>
          <Link href="/admin/system">
            <Card className="hover:shadow-md transition-shadow cursor-pointer border-green-200 bg-green-50">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg text-green-700">System Status</CardTitle>
                <CardDescription>Server health, database stats, and performance</CardDescription>
              </CardHeader>
            </Card>
          </Link>
          <Link href="/admin/brands">
            <Card className="hover:shadow-md transition-shadow cursor-pointer border-purple-200 bg-purple-50">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg text-purple-700">Brand Management</CardTitle>
                <CardDescription>View all registered brands and their activity</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        </div>

        {/* Stats Grid */}
        {stats && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
              <StatCard title="Brands" value={stats.totals.brands} color="blue" />
              <StatCard title="Users" value={stats.totals.owners} color="indigo" />
              <StatCard title="Transactions" value={stats.totals.transactions} color="green" />
              <StatCard title="Products" value={stats.totals.products} color="yellow" />
              <StatCard title="Stores" value={stats.totals.stores} color="purple" />
              <StatCard title="Stock Moves" value={stats.totals.stockMovements} color="red" />
            </div>

            {/* Top Brands */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Top Brands by Transactions</CardTitle>
                </CardHeader>
                <CardContent>
                  {stats.topBrands.length === 0 ? (
                    <p className="text-gray-500 text-sm">No brands with transactions yet</p>
                  ) : (
                    <div className="space-y-3">
                      {stats.topBrands.map((brand, i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div>
                            <p className="font-medium">{brand.name}</p>
                            <p className="text-sm text-gray-500">{brand.subdomain}.chronizer.com</p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">{parseInt(brand.transaction_count)} txns</p>
                            <p className="text-sm text-green-600">
                              ${parseFloat(brand.total_revenue).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Recent Daily Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  {stats.recentTransactions.length === 0 ? (
                    <p className="text-gray-500 text-sm">No recent transactions</p>
                  ) : (
                    <div className="space-y-2">
                      {stats.recentTransactions.slice(0, 10).map((day, i) => (
                        <div key={i} className="flex items-center justify-between p-2 border-b last:border-0">
                          <span className="text-sm text-gray-600">
                            {new Date(day.date).toLocaleDateString()}
                          </span>
                          <div className="text-right">
                            <span className="font-medium">{parseInt(day.count)} txns</span>
                            <span className="text-sm text-gray-500 ml-2">
                              ${parseFloat(day.total).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ title, value, color }: { title: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    indigo: 'bg-indigo-50 border-indigo-200 text-indigo-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
    red: 'bg-red-50 border-red-200 text-red-700',
  };

  return (
    <Card className={`${colorMap[color]} border`}>
      <CardContent className="pt-4 pb-3 text-center">
        <p className="text-3xl font-bold">{value.toLocaleString()}</p>
        <p className="text-sm mt-1 opacity-80">{title}</p>
      </CardContent>
    </Card>
  );
}

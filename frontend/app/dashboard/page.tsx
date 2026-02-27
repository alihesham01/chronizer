'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Package, Store, ShoppingCart, BarChart3, Activity, TrendingUp, LogOut } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AuthGuard, useAuth } from '@/lib/auth-guard';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface DashboardStats {
  today: { txn_count: string; revenue: string };
  month: { txn_count: string; revenue: string };
  stores: number;
  products: number;
}

function DashboardContent() {
  const router = useRouter();
  const { getBrand, getOwner, logout } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const brand = getBrand();
  const owner = getOwner();

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) return;
    fetch(`${API_URL}/api/brand/dashboard`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => { if (data.success) setStats(data.data); })
      .catch(() => {});
  }, []);

  const fmt = (v: string | number) => {
    const n = Number(v);
    return isNaN(n) ? '0' : n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  };

  const navItems = [
    { label: 'Products', href: '/products', icon: Package, desc: 'Manage product catalog' },
    { label: 'Stores', href: '/stores', icon: Store, desc: 'Manage store locations' },
    { label: 'Transactions', href: '/transactions', icon: ShoppingCart, desc: 'View & manage transactions' },
    { label: 'Inventory', href: '/inventory', icon: Activity, desc: 'Smart inventory tracking' },
    { label: 'Stock Moves', href: '/stock-moves', icon: TrendingUp, desc: 'Track inventory movements' },
    { label: 'Analytics', href: '/analytics', icon: BarChart3, desc: 'Reports & insights' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{brand?.name || 'Dashboard'}</h1>
          <p className="text-sm text-gray-500">Welcome back, {owner?.firstName || owner?.email || 'User'}</p>
        </div>
        <Button variant="outline" size="sm" onClick={logout}>
          <LogOut className="h-4 w-4 mr-2" /> Sign Out
        </Button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs font-medium text-gray-500 uppercase">Today Revenue</p>
              <p className="text-2xl font-bold">${fmt(stats.today.revenue)}</p>
              <p className="text-xs text-gray-400">{fmt(stats.today.txn_count)} transactions</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs font-medium text-gray-500 uppercase">This Month</p>
              <p className="text-2xl font-bold">${fmt(stats.month.revenue)}</p>
              <p className="text-xs text-gray-400">{fmt(stats.month.txn_count)} transactions</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs font-medium text-gray-500 uppercase">Active Stores</p>
              <p className="text-2xl font-bold">{stats.stores}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs font-medium text-gray-500 uppercase">Products</p>
              <p className="text-2xl font-bold">{stats.products}</p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {navItems.map(item => (
          <Card key={item.href} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => router.push(item.href)}>
            <CardHeader className="flex flex-row items-center gap-3 pb-2">
              <item.icon className="h-5 w-5 text-blue-600" />
              <CardTitle className="text-lg">{item.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>{item.desc}</CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  );
}

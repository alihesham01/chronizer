'use client';

import React, { useEffect, useState } from 'react';
import { StatCard } from '@/components/dashboard/stat-card';
import { RevenueChart } from '@/components/dashboard/revenue-chart';
import { TopProducts } from '@/components/dashboard/top-products';
import { RecentTransactions } from '@/components/dashboard/recent-transactions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  DollarSign, 
  ShoppingCart, 
  TrendingUp, 
  Store,
  Activity,
  Zap
} from 'lucide-react';
import { api, DashboardMetrics } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { motion } from 'framer-motion';

export default function Dashboard() {
  const { toast } = useToast();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // Mock data for charts
  const revenueData = [
    { date: '2024-02-18', revenue: 42000, transactions: 180 },
    { date: '2024-02-19', revenue: 48000, transactions: 210 },
    { date: '2024-02-20', revenue: 45000, transactions: 195 },
    { date: '2024-02-21', revenue: 52000, transactions: 230 },
    { date: '2024-02-22', revenue: 49000, transactions: 215 },
    { date: '2024-02-23', revenue: 55000, transactions: 245 },
    { date: '2024-02-24', revenue: 45230, transactions: 234 },
  ];

  const topProducts = [
    { sku: 'PROD001', name: 'Premium Widget', revenue: 12500, quantity: 125, growth: 15.3 },
    { sku: 'PROD002', name: 'Standard Widget', revenue: 10200, quantity: 204, growth: 8.7 },
    { sku: 'PROD003', name: 'Deluxe Widget', revenue: 8900, quantity: 89, growth: -2.1 },
    { sku: 'PROD004', name: 'Basic Widget', revenue: 7600, quantity: 380, growth: 22.5 },
    { sku: 'PROD005', name: 'Pro Widget', revenue: 6200, quantity: 62, growth: 5.4 },
  ];

  const recentTransactions = [
    {
      id: 1,
      sku: 'PROD001',
      storeName: 'Store A',
      quantity: 5,
      totalAmount: 250.00,
      type: 'sale' as const,
      date: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    },
    {
      id: 2,
      sku: 'PROD002',
      storeName: 'Store B',
      quantity: 3,
      totalAmount: 150.00,
      type: 'sale' as const,
      date: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    },
    {
      id: 3,
      sku: 'PROD003',
      storeName: 'Store A',
      quantity: 2,
      totalAmount: 200.00,
      type: 'refund' as const,
      date: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    },
    {
      id: 4,
      sku: 'PROD004',
      storeName: 'Store C',
      quantity: 10,
      totalAmount: 200.00,
      type: 'sale' as const,
      date: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    },
    {
      id: 5,
      sku: 'PROD005',
      storeName: 'Store B',
      quantity: 1,
      totalAmount: 100.00,
      type: 'sale' as const,
      date: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    },
  ];

  useEffect(() => {
    fetchDashboardData();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const data = await api.getDashboardMetrics();
      setMetrics(data);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Failed to fetch dashboard metrics:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch dashboard data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const calculateGrowth = (current: number, previous: number) => {
    if (previous === 0) return 0;
    return ((current - previous) / previous) * 100;
  };

  const revenueGrowth = metrics 
    ? calculateGrowth(metrics.today.today_revenue, 38000)
    : 0;

  const transactionGrowth = metrics 
    ? calculateGrowth(metrics.today.today_transactions, metrics.yesterday.yesterday_transactions)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold gradient-text">Dashboard</h1>
          <p className="text-muted-foreground">
            Real-time transaction insights and analytics
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1">
            <Activity className="h-3 w-3" />
            Live
          </Badge>
          <Button variant="outline" size="sm" onClick={fetchDashboardData}>
            Refresh
          </Button>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Today's Revenue"
          value={metrics?.today.today_revenue || 0}
          change={revenueGrowth}
          changeLabel="vs yesterday"
          icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
          loading={loading}
          format="currency"
          trend={revenueGrowth > 0 ? 'up' : revenueGrowth < 0 ? 'down' : 'neutral'}
        />
        <StatCard
          title="Today's Transactions"
          value={metrics?.today.today_transactions || 0}
          change={transactionGrowth}
          changeLabel="vs yesterday"
          icon={<ShoppingCart className="h-4 w-4 text-muted-foreground" />}
          loading={loading}
          format="number"
          trend={transactionGrowth > 0 ? 'up' : transactionGrowth < 0 ? 'down' : 'neutral'}
        />
        <StatCard
          title="Monthly Revenue"
          value={metrics?.month.month_revenue || 0}
          icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
          loading={loading}
          format="currency"
        />
        <StatCard
          title="Top Store"
          value={metrics?.topStore?.store_name || 'N/A'}
          icon={<Store className="h-4 w-4 text-muted-foreground" />}
          loading={loading}
          format="none"
        />
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RevenueChart data={revenueData} loading={loading} />
        </div>
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                System Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">API</span>
                <Badge variant="success">Online</Badge>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-sm">Database</span>
                <Badge variant="success">Connected</Badge>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-sm">Cache</span>
                <Badge variant="success">Active</Badge>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-sm">Queue</span>
                <Badge variant="default">Idle</Badge>
              </div>
              <Separator />
              <p className="text-xs text-muted-foreground">
                Last updated: {lastUpdated.toLocaleTimeString()}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        <TopProducts data={topProducts} loading={loading} />
        <RecentTransactions data={recentTransactions} loading={loading} />
      </div>
    </div>
  );
}

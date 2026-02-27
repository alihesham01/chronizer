'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, getRelativeTime } from '@/lib/utils';
import { motion } from 'framer-motion';
import { ShoppingCart, Package, RefreshCw } from 'lucide-react';

interface RecentTransactionsProps {
  data?: Array<{
    id: number;
    sku: string;
    storeName: string;
    quantity: number;
    totalAmount: number;
    type: 'sale' | 'refund' | 'adjustment';
    date: string;
  }>;
  loading?: boolean;
  className?: string;
}

export function RecentTransactions({ data = [], loading = false, className }: RecentTransactionsProps) {
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'sale':
        return <ShoppingCart className="h-4 w-4" />;
      case 'refund':
        return <RefreshCw className="h-4 w-4" />;
      case 'adjustment':
        return <Package className="h-4 w-4" />;
      default:
        return <ShoppingCart className="h-4 w-4" />;
    }
  };

  const getTypeVariant = (type: string) => {
    switch (type) {
      case 'sale':
        return 'default';
      case 'refund':
        return 'destructive';
      case 'adjustment':
        return 'secondary';
      default:
        return 'default';
    }
  };

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 rounded" />
                  <div>
                    <Skeleton className="h-4 w-24 mb-1" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.3 }}
    >
      <Card className={className}>
        <CardHeader>
          <CardTitle>Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {data.map((transaction, index) => (
              <motion.div
                key={transaction.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.4 + index * 0.05 }}
                className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                    {getTypeIcon(transaction.type)}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{transaction.sku}</p>
                    <p className="text-xs text-muted-foreground">
                      {transaction.storeName} • {getRelativeTime(transaction.date)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{formatCurrency(transaction.totalAmount)}</p>
                  <Badge variant={getTypeVariant(transaction.type)} className="text-xs">
                    {transaction.type}
                  </Badge>
                </div>
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

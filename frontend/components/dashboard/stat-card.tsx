'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatCurrency, formatNumber, formatPercent } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { motion } from 'framer-motion';

interface StatCardProps {
  title: string;
  value: number | string;
  change?: number;
  changeLabel?: string;
  icon?: React.ReactNode;
  loading?: boolean;
  className?: string;
  format?: 'currency' | 'number' | 'percent' | 'none';
  trend?: 'up' | 'down' | 'neutral';
}

export function StatCard({
  title,
  value,
  change,
  changeLabel,
  icon,
  loading = false,
  className,
  format = 'none',
  trend,
}: StatCardProps) {
  const [displayValue, setDisplayValue] = useState('0');
  const [displayChange, setDisplayChange] = useState('0');

  // Animate numbers
  useEffect(() => {
    if (loading) return;

    const targetValue = typeof value === 'number' ? value : 0;
    const targetChange = change || 0;
    const duration = 800;
    const steps = 20;
    const increment = targetValue / steps;
    const changeIncrement = targetChange / steps;
    let current = 0;
    let currentChange = 0;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      current = Math.min(current + increment, targetValue);
      currentChange = Math.min(currentChange + changeIncrement, targetChange);

      // Format display value
      if (format === 'currency') {
        setDisplayValue(formatCurrency(current));
      } else if (format === 'number') {
        setDisplayValue(formatNumber(current));
      } else if (format === 'percent') {
        setDisplayValue(formatPercent(current));
      } else {
        setDisplayValue(value.toString());
      }

      // Format change
      if (change !== undefined) {
        setDisplayChange(formatPercent(currentChange));
      }

      if (step >= steps) {
        clearInterval(timer);
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [value, change, format, loading]);

  if (loading) {
    return (
      <Card className={cn('card-hover', className)}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-4" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-24 mb-2" />
          <Skeleton className="h-4 w-16" />
        </CardContent>
      </Card>
    );
  }

  const getTrendIcon = () => {
    if (trend === 'up' || (change && change > 0)) {
      return <TrendingUp className="h-4 w-4 text-green-600" />;
    } else if (trend === 'down' || (change && change < 0)) {
      return <TrendingDown className="h-4 w-4 text-red-600" />;
    }
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  };

  const getTrendColor = () => {
    if (trend === 'up' || (change && change > 0)) {
      return 'text-green-600';
    } else if (trend === 'down' || (change && change < 0)) {
      return 'text-red-600';
    }
    return 'text-muted-foreground';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className={cn('card-hover relative overflow-hidden', className)}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {title}
          </CardTitle>
          {icon}
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold number-animation">
            {displayValue}
          </div>
          {change !== undefined && (
            <div className="flex items-center space-x-1 text-xs">
              {getTrendIcon()}
              <span className={cn('font-medium', getTrendColor())}>
                {displayChange}
              </span>
              {changeLabel && (
                <span className="text-muted-foreground">
                  {changeLabel}
                </span>
              )}
            </div>
          )}
        </CardContent>
        {/* Subtle background gradient */}
        <div className="absolute bottom-0 right-0 h-20 w-20 opacity-5">
          <div className="h-full w-full bg-primary rounded-full blur-2xl" />
        </div>
      </Card>
    </motion.div>
  );
}

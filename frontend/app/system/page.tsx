'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { api, CacheStats, QueueStats, HealthStatus } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { motion } from 'framer-motion';
import {
  Database,
  Zap,
  Activity,
  Server,
  Clock,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { formatNumber } from '@/lib/utils';

export default function SystemPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  useEffect(() => {
    fetchSystemData();
    const interval = setInterval(fetchSystemData, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchSystemData = async () => {
    try {
      const [healthData, cacheData, queueData] = await Promise.all([
        api.getHealth(),
        api.getCacheStats(),
        api.getQueueStats(),
      ]);
      
      setHealth(healthData);
      setCacheStats(cacheData);
      setQueueStats(queueData);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Failed to fetch system data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleWarmCache = async () => {
    try {
      await api.warmCache();
      toast({
        title: 'Success',
        description: 'Cache warmed successfully',
      });
      fetchSystemData();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to warm cache',
        variant: 'destructive',
      });
    }
  };

  const handleClearCache = async () => {
    try {
      await api.clearCache();
      toast({
        title: 'Success',
        description: 'Cache cleared successfully',
      });
      fetchSystemData();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to clear cache',
        variant: 'destructive',
      });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ok':
      case 'connected':
      case 'running':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'disabled':
        return <AlertCircle className="h-4 w-4 text-yellow-600" />;
      default:
        return <AlertCircle className="h-4 w-4 text-red-600" />;
    }
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'ok':
      case 'connected':
      case 'running':
        return 'success';
      case 'disabled':
        return 'secondary';
      default:
        return 'destructive';
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-32 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-[200px]" />
          <Skeleton className="h-[200px]" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold">System Status</h1>
          <p className="text-muted-foreground">
            Monitor system health and performance metrics
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1">
            <Clock className="h-3 w-3" />
            Last updated: {lastUpdated.toLocaleTimeString()}
          </Badge>
          <Button variant="outline" size="sm" onClick={fetchSystemData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </motion.div>

      {/* Service Status */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              Service Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {Object.entries(health?.services || {}).map(([service, status]) => (
                <div key={service} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(status.status)}
                    <span className="capitalize font-medium">{service}</span>
                  </div>
                  <Badge variant={getStatusVariant(status.status)}>
                    {status.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Metrics */}
      <Tabs defaultValue="cache" className="space-y-4">
        <TabsList>
          <TabsTrigger value="cache">Cache Metrics</TabsTrigger>
          <TabsTrigger value="queue">Queue Metrics</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="cache" className="space-y-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Cache Performance
                </CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleWarmCache}>
                    <Zap className="h-4 w-4 mr-2" />
                    Warm Cache
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleClearCache}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Clear Cache
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Hit Rates */}
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>L1 Cache Hit Rate</span>
                      <span className="font-medium">{cacheStats?.metrics.l1.hitRate.toFixed(1)}%</span>
                    </div>
                    <Progress value={cacheStats?.metrics.l1.hitRate || 0} className="h-2" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>L2 Cache Hit Rate</span>
                      <span className="font-medium">{cacheStats?.metrics.l2.hitRate.toFixed(1)}%</span>
                    </div>
                    <Progress value={cacheStats?.metrics.l2.hitRate || 0} className="h-2" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Overall Hit Rate</span>
                      <span className="font-medium">{cacheStats?.metrics.overall.hitRate.toFixed(1)}%</span>
                    </div>
                    <Progress value={cacheStats?.metrics.overall.hitRate || 0} className="h-2" />
                  </div>
                </div>

                <Separator />

                {/* Cache Stats */}
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">L1 Cache Size</p>
                    <p className="text-2xl font-bold">
                      {((cacheStats?.l1?.size || 0) / 1024 / 1024).toFixed(1)} MB
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Items Cached</p>
                    <p className="text-2xl font-bold">{formatNumber(cacheStats?.l1.itemCount || 0)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Evictions</p>
                    <p className="text-2xl font-bold">{formatNumber(cacheStats?.l1.evictions || 0)}</p>
                  </div>
                </div>

                <Separator />

                {/* Hit/Miss Counts */}
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Cache Hits</p>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span>L1:</span>
                        <span className="font-medium">{formatNumber(cacheStats?.metrics.l1.hits || 0)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>L2:</span>
                        <span className="font-medium">{formatNumber(cacheStats?.metrics.l2.hits || 0)}</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Cache Misses</p>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span>L1:</span>
                        <span className="font-medium">{formatNumber(cacheStats?.metrics.l1.misses || 0)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>L2:</span>
                        <span className="font-medium">{formatNumber(cacheStats?.metrics.l2.misses || 0)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        <TabsContent value="queue" className="space-y-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Queue Statistics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {Object.entries(queueStats?.queueStats || {}).map(([queue, stats]) => (
                  <div key={queue} className="space-y-4">
                    <h3 className="text-lg font-semibold capitalize">{queue} Queue</h3>
                    <div className="grid gap-4 md:grid-cols-4">
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Waiting</p>
                        <p className="text-2xl font-bold">{formatNumber(stats.waiting)}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Active</p>
                        <p className="text-2xl font-bold">{formatNumber(stats.active)}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Completed</p>
                        <p className="text-2xl font-bold">{formatNumber(stats.completed)}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Failed</p>
                        <p className="text-2xl font-bold text-red-600">{formatNumber(stats.failed)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card>
              <CardHeader>
                <CardTitle>Performance Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12">
                  <Activity className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Performance metrics coming soon</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
